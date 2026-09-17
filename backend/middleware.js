const jwt = require("jsonwebtoken");
const db = require("./db");

const { config } = require("./config");

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
  db.get("SELECT id, email, role FROM users WHERE id = ?", [req.user.id], (err, row) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!row) return res.status(403).json({ error: "Account no longer exists" });
    req.account = { id: row.id, email: row.email, role: row.role || "contributor" };
    next();
  });
}

function requireRole(...roles) {
  return [
    authMiddleware,
    loadRole,
    (req, res, next) => {
      if (!roles.includes(req.account.role)) {
        return res.status(403).json({ error: `Requires role: ${roles.join(" or ")}` });
      }
      next();
    }
  ];
}

module.exports = { authMiddleware, loadRole, requireRole, SECRET };
