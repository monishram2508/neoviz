const express = require("express");

const { config } = require("./config");
const { all, get } = require("./sql");
const { load } = require("./archiveCache");
const { eventsForUser } = require("./audit");
const { atLeast, effectiveRole } = require("./roles");
const { resolveTarget } = require("./contributions");
const { rowToSubmission, SELECT_SUBMISSION } = require("./submissions");
const { authMiddleware, loadRole, asyncRoute } = require("./middleware");

const router = express.Router();

const ITEM_FIELDS = ["body", "bodyUrdu", "source", "url", "comment"];

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

const toItem = (row) => ({
  id: row.id,
  type: row.type,
  ...pick(JSON.parse(row.payload), ITEM_FIELDS),
  approvedAt: row.decided_at,
  contributor: row.display_name ? { id: row.user_id, displayName: row.display_name } : null
});

async function approvedFor(kind, key) {
  const rows = await all(
    `${SELECT_SUBMISSION}
     WHERE s.status = 'approved' AND s.type IN ('note', 'citation')
       AND s.target_kind = ? AND lower(trim(s.target)) = lower(trim(?))
     ORDER BY s.decided_at, s.id`,
    [kind, key]
  );
  return rows.map(toItem);
}

function targetOf(data, row) {
  const kind = row.target_kind || "work";
  const found = resolveTarget(data, kind, row.target);
  return { kind, label: row.target, slug: found.status === "ok" ? found.node.slug : null };
}

const loadUser = (id) =>
get("SELECT id, email, role, display_name, show_email, disabled_at FROM users WHERE id = ?", [id]);

async function publicProfile(id, data) {
  const user = await loadUser(id);
  if (!user) return null;
  const rows = await all(
    `${SELECT_SUBMISSION} WHERE s.user_id = ? AND s.status = 'approved' ORDER BY s.decided_at DESC, s.id DESC`,
    [user.id]
  );
  return {
    id: user.id,
    displayName: user.display_name || `User ${user.id}`,
    ...(user.show_email ? { email: user.email } : {}),
    contributions: rows.map((row) => ({
      id: row.id,
      type: row.type,
      approvedAt: row.decided_at,
      payload: JSON.parse(row.payload),
      target: targetOf(data, row)
    }))
  };
}

router.get("/people/:id/full", authMiddleware, loadRole, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const isAdmin = atLeast(req.account.role, "admin");
  if (id !== req.account.id && !isAdmin) {
    return res.status(403).json({ error: "You can only see your own full profile" });
  }

  const user = await loadUser(id);
  if (!user) return res.status(404).json({ error: "No such person" });
  const profile = await publicProfile(id, await load());
  const rows = await all(`${SELECT_SUBMISSION} WHERE s.user_id = ? ORDER BY s.created_at DESC, s.id DESC`, [id]);

  res.json({
    ...profile,
    email: user.email,
    showEmail: Boolean(user.show_email),
    role: effectiveRole(user, config.sysadminEmails),
    disabled: Boolean(user.disabled_at),
    submissions: rows.map(rowToSubmission),
    ...(isAdmin ? { log: await eventsForUser(id) } : {})
  });
}));

module.exports = router;
module.exports.approvedFor = approvedFor;
module.exports.publicProfile = publicProfile;
