const sqlite3 = require("sqlite3").verbose();
const { config } = require("./config");

const db = new sqlite3.Database(config.dbFile);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      neo4j_uri TEXT,
      neo4j_username TEXT,
      neo4j_password TEXT
    )
  `);
  db.run(`
  CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    uri TEXT,
    username TEXT,
    password TEXT,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

  db.run(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    target TEXT,
    payload TEXT NOT NULL,
    file_name TEXT,
    file_path TEXT,
    file_size INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    moderator_id INTEGER,
    moderator_note TEXT,
    applied_cypher TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    decided_at DATETIME
  )
`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id)`);

  db.all(`PRAGMA table_info(users)`, (err, cols) => {
    if (err || !cols) return;
    if (!cols.some((c) => c.name === "role")) {
      db.run(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'contributor'`, (e) => {
        if (e) console.error("Failed to add users.role:", e.message);
        else console.log("Migrated: users.role added (default 'contributor')");
        seedModerators();
      });
    } else {
      seedModerators();
    }
  });
});

function seedModerators() {
  const list = config.moderatorEmails;
  if (!list.length) return;
  const marks = list.map(() => "?").join(",");
  db.run(
    `UPDATE users SET role = 'moderator' WHERE lower(email) IN (${marks}) AND role <> 'moderator'`,
    list,
    function (err) {
      if (err) console.error("Moderator seed failed:", err.message);
      else if (this.changes) console.log(`Promoted ${this.changes} user(s) to moderator`);
    }
  );
}

module.exports = db;
