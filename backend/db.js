const sqlite3 = require("sqlite3").verbose();
const { config } = require("./config");

const db = new sqlite3.Database(config.dbFile);
module.exports = db;

const { run, all } = require("./sql");

async function addColumn(table, column, definition) {
  const cols = await all(`PRAGMA table_info(${table})`);
  if (cols.some((c) => c.name === column)) return;
  await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`Migrated: ${table}.${column} added`);
}

async function seedRole(role, emails, keep) {
  if (!emails.length) return;
  const marks = emails.map(() => "?").join(",");
  const kept = keep.map(() => "?").join(",");
  const { changes } = await run(
    `UPDATE users SET role = ? WHERE lower(email) IN (${marks}) AND role NOT IN (${kept})`,
    [role, ...emails, ...keep]
  );
  if (changes) console.log(`Promoted ${changes} user(s) to ${role}`);
}

async function warnCaseDuplicates() {
  const dupes = await all("SELECT lower(email) AS email FROM users GROUP BY lower(email) HAVING count(*) > 1");
  if (!dupes.length) return;
  console.warn(
    `  ${dupes.length} email address(es) are registered more than once with different capitalisation.` +
    " Sign-in now ignores case, so only the oldest of each can sign in. Merge or delete the extras."
  );
}

async function migrate() {
  await run("PRAGMA journal_mode = WAL");
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      neo4j_uri TEXT,
      neo4j_username TEXT,
      neo4j_password TEXT
    )
  `);
  await run(`
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
  await run(`
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
  await run(`CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id)`);

  await addColumn("users", "role", "TEXT NOT NULL DEFAULT 'contributor'");
  await addColumn("users", "display_name", "TEXT");
  await addColumn("users", "show_email", "INTEGER NOT NULL DEFAULT 0");
  await addColumn("users", "disabled_at", "DATETIME");
  await addColumn("submissions", "target_kind", "TEXT");
  await addColumn("submissions", "updated_at", "DATETIME");

  await run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at DATETIME DEFAULT CURRENT_TIMESTAMP,
      actor_id INTEGER,
      action TEXT NOT NULL,
      submission_id INTEGER,
      subject_user_id INTEGER,
      reason TEXT,
      details TEXT
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_submission ON audit_log(submission_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_log(subject_user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id)`);

  await seedRole("admin", config.adminEmails, ["admin"]);
  await seedRole("moderator", config.moderatorEmails, ["moderator", "admin"]);
  await warnCaseDuplicates();
}

db.ready = migrate();
