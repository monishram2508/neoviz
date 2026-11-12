const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { config } = require("./config");
const { run, get } = require("./sql");
const { logEvent } = require("./audit");
const { normEmail } = require("./roles");
const { authLimiter } = require("./limits");
const { authMiddleware, loadRole, asyncRoute, SECRET } = require("./middleware");

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const NAME_MIN = 2;
const NAME_MAX = 40;
const BCRYPT_ROUNDS = 10;
const TOKEN_TTL = "7d";
const LOGIN_FAILED = "Incorrect email or password.";

const cleanName = (v) => String(v ?? "").trim();

const nameError = (name) =>
name.length < NAME_MIN || name.length > NAME_MAX ?
`Display name must be ${NAME_MIN}–${NAME_MAX} characters` :
null;

const signToken = (id) => jwt.sign({ id }, SECRET, { expiresIn: TOKEN_TTL });

function seededRole(email) {
  if (config.adminEmails.includes(email)) return "admin";
  if (config.moderatorEmails.includes(email)) return "moderator";
  return "contributor";
}

const meShape = (row, role) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name || null,
  showEmail: Boolean(row.show_email),
  role
});

const loadMe = (id) => get("SELECT id, email, display_name, show_email FROM users WHERE id = ?", [id]);

async function insertUser(email, hash, displayName, showEmail) {
  try {
    const { lastID } = await run(
      "INSERT INTO users (email, password, role, display_name, show_email) VALUES (?, ?, ?, ?, ?)",
      [email, hash, seededRole(email), displayName, showEmail ? 1 : 0]
    );
    return lastID;
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT") return null;
    throw err;
  }
}

router.post("/register", authLimiter, asyncRoute(async (req, res) => {
  const email = normEmail(req.body.email);
  const password = String(req.body.password ?? "");
  const displayName = cleanName(req.body.displayName);

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
  if (password.length < PASSWORD_MIN) {
    return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN} characters.` });
  }
  const badName = nameError(displayName);
  if (badName) return res.status(400).json({ error: badName });

  const taken = await get("SELECT id FROM users WHERE lower(email) = ?", [email]);
  const id = taken ? null : await insertUser(email, await bcrypt.hash(password, BCRYPT_ROUNDS), displayName, req.body.showEmail === true);
  if (!id) return res.status(400).json({ error: "An account with this email already exists." });

  await logEvent({ actorId: id, action: "user.registered", subjectUserId: id });
  res.status(201).json({ token: signToken(id) });
}));

router.post("/login", authLimiter, asyncRoute(async (req, res) => {
  const email = normEmail(req.body.email);
  const password = String(req.body.password ?? "");
  const user = email ?
  await get("SELECT id, password, disabled_at FROM users WHERE lower(email) = ? ORDER BY id LIMIT 1", [email]) :
  null;

  const ok = Boolean(user && user.password) && (await bcrypt.compare(password, user.password));
  if (!ok) return res.status(400).json({ error: LOGIN_FAILED });
  if (user.disabled_at) return res.status(403).json({ error: "This account has been disabled. Please contact an administrator." });

  res.json({ token: signToken(user.id) });
}));

router.get("/me", authMiddleware, loadRole, asyncRoute(async (req, res) => {
  res.json(meShape(await loadMe(req.account.id), req.account.role));
}));

router.patch("/me", authMiddleware, loadRole, asyncRoute(async (req, res) => {
  const before = await loadMe(req.account.id);
  const { displayName: nameIn, showEmail: showIn } = req.body;

  const displayName = nameIn === undefined ? before.display_name : cleanName(nameIn);
  const badName = nameIn === undefined ? null : nameError(displayName);
  if (badName) return res.status(400).json({ error: badName });
  if (showIn !== undefined && typeof showIn !== "boolean") {
    return res.status(400).json({ error: "showEmail must be true or false" });
  }
  const showEmail = showIn === undefined ? Boolean(before.show_email) : showIn;

  await run("UPDATE users SET display_name = ?, show_email = ? WHERE id = ?", [displayName, showEmail ? 1 : 0, before.id]);

  const changed = [
  ["displayName", before.display_name || null, displayName],
  ["showEmail", Boolean(before.show_email), showEmail]].
  filter(([, from, to]) => from !== to);
  if (changed.length) {
    await logEvent({
      actorId: before.id,
      action: "user.profile_changed",
      subjectUserId: before.id,
      details: {
        from: Object.fromEntries(changed.map(([key, from]) => [key, from])),
        to: Object.fromEntries(changed.map(([key,, to]) => [key, to]))
      }
    });
  }

  res.json(meShape({ ...before, display_name: displayName, show_email: showEmail }, req.account.role));
}));

module.exports = router;
