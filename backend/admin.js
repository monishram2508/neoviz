const express = require("express");
const fs = require("fs");

const { config } = require("./config");
const { run, get, all } = require("./sql");
const { load } = require("./archiveCache");
const { logEvent, recentEvents } = require("./audit");
const { effectiveRole, canManage, canAssign } = require("./roles");
const { requireRole, asyncRoute } = require("./middleware");

const router = express.Router();

const USERS_SQL = `
  SELECT u.id, u.email, u.display_name, u.role, u.disabled_at,
    (SELECT count(*) FROM submissions s WHERE s.user_id = u.id AND s.status = 'pending') AS pending,
    (SELECT count(*) FROM submissions s WHERE s.user_id = u.id AND s.status = 'approved') AS approved
  FROM users u ORDER BY u.id`;

const shapeUser = (row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name || null,
  role: effectiveRole(row, config.sysadminEmails),
  disabled: Boolean(row.disabled_at),
  pending: row.pending,
  approved: row.approved
});

const loadTarget = asyncRoute(async (req, res, next) => {
  const row = await get("SELECT id, email, role, display_name, disabled_at FROM users WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "No such user" });
  const role = effectiveRole(row, config.sysadminEmails);
  if (!canManage(req.account.role, role)) return res.status(403).json({ error: "You can't change this account" });
  req.target = { ...row, role };
  next();
});

const fileSize = (file) => {
  try {
    return fs.statSync(file).size;
  } catch {
    return null;
  }
};

router.get("/users", requireRole("admin"), asyncRoute(async (req, res) => {
  res.json((await all(USERS_SQL)).map(shapeUser));
}));

router.post("/users/:id/role", requireRole("admin"), loadTarget, asyncRoute(async (req, res) => {
  const role = String(req.body.role || "").trim();
  if (!canAssign(req.account.role, role)) return res.status(403).json({ error: "You can't assign that role" });

  const from = req.target.role;
  await run("UPDATE users SET role = ? WHERE id = ?", [role, req.target.id]);
  if (from !== role) {
    await logEvent({
      actorId: req.account.id,
      action: "user.role_changed",
      subjectUserId: req.target.id,
      details: { from, to: role }
    });
  }
  res.json({ id: req.target.id, role });
}));

const setDisabled = (disabled) =>
asyncRoute(async (req, res) => {
  if (Boolean(req.target.disabled_at) !== disabled) {
    await run("UPDATE users SET disabled_at = ? WHERE id = ?", [
    disabled ? new Date().toISOString() : null,
    req.target.id]
    );
    await logEvent({
      actorId: req.account.id,
      action: disabled ? "user.disabled" : "user.enabled",
      subjectUserId: req.target.id
    });
  }
  res.json({ id: req.target.id, disabled });
});

router.post("/users/:id/disable", requireRole("admin"), loadTarget, setDisabled(true));
router.post("/users/:id/enable", requireRole("admin"), loadTarget, setDisabled(false));

router.delete("/users/:id", requireRole("sysadmin"), loadTarget, asyncRoute(async (req, res) => {
  await logEvent({
    actorId: req.account.id,
    action: "user.deleted",
    subjectUserId: req.target.id,
    details: { displayName: req.target.display_name || null }
  });
  await run("DELETE FROM connections WHERE user_id = ?", [req.target.id]);
  await run("DELETE FROM users WHERE id = ?", [req.target.id]);
  res.status(204).end();
}));

router.get("/audit", requireRole("admin"), asyncRoute(async (req, res) => {
  res.json(await recentEvents({ before: req.query.before, limit: req.query.limit }));
}));

router.get("/system", requireRole("sysadmin"), asyncRoute(async (req, res) => {
  const data = await load();
  res.json({
    archive: data.meta,
    dbFile: config.dbFile,
    dbBytes: fileSize(config.dbFile),
    uploadDir: config.uploadDir,
    liveSnapshot: config.archiveLiveSnapshot,
    liveSnapshotExists: fs.existsSync(config.archiveLiveSnapshot)
  });
}));

router.post("/system/reload", requireRole("sysadmin"), asyncRoute(async (req, res) => {
  const data = await load({ force: true });
  await logEvent({ actorId: req.account.id, action: "archive.reloaded", details: { source: data.meta.source } });
  res.json(data.meta);
}));

module.exports = router;
