const jwt = require("jsonwebtoken");
const db = require("./db");

const { config } = require("./config");
const { effectiveRole, atLeast } = require("./roles");

const SECRET = config.jwtSecret;

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "No token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const user = jwt.verify(token, SECRET);
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }
}

function loadRole(req, res, next) {
  db.get(
    "SELECT id, email, role, display_name, disabled_at FROM users WHERE id = ?",
    [req.user.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!row) return res.status(403).json({ error: "Account no longer exists" });
      if (row.disabled_at) return res.status(403).json({ error: "This account has been disabled. Please contact an administrator." });
      req.account = {
        id: row.id,
        email: row.email,
        role: effectiveRole(row, config.sysadminEmails),
        displayName: row.display_name || null
      };
      next();
    }
  );
}

function requireRole(min) {
  return [
    authMiddleware,
    loadRole,
    (req, res, next) => {
      if (!atLeast(req.account.role, min)) {
        return res.status(403).json({ error: `Requires ${min} or higher` });
      }
      next();
    }
  ];
}

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

module.exports = { authMiddleware, loadRole, requireRole, asyncRoute, SECRET };
