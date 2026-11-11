const fs = require("fs");
const os = require("os");
const path = require("path");

const FIXTURE = path.join(__dirname, "fixtures", "snapshot.json");
const BACKEND = path.join(__dirname, "..") + path.sep;
const VENDOR = `${path.sep}node_modules${path.sep}`;

function forgetBackendModules() {
  Object.keys(require.cache).
  filter((file) => file.startsWith(BACKEND) && !file.includes(VENDOR) && !file.startsWith(__dirname)).
  forEach((file) => delete require.cache[file]);
}

async function startServer({ sysadmins = "root@test.dev", admins = "", moderators = "", limits = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bayaaz-test-"));
  forgetBackendModules();
  Object.assign(process.env, {
    NODE_ENV: limits ? "development" : "test",
    JWT_SECRET: "test-secret",
    DB_FILE: path.join(dir, "test.db"),
    UPLOAD_DIR: path.join(dir, "uploads"),
    ARCHIVE_LIVE_SNAPSHOT: path.join(dir, "archive_live.json"),
    ARCHIVE_NEO4J_URI: "",
    ARCHIVE_SNAPSHOT: FIXTURE,
    SYSADMIN_EMAILS: sysadmins,
    ADMIN_EMAILS: admins,
    MODERATOR_EMAILS: moderators,
    GROQ_API_KEY: "",
    SERVE_FRONTEND: "false",
    TRUST_PROXY: ""
  });
  const app = require("../index");
  const db = require("../db");
  await db.ready;
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const stop = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() =>
        db.close(() => {
          fs.rmSync(dir, { recursive: true, force: true });
          resolve();
        })
      );
    });
  return { base, stop, dir };
}

async function api(base, p, { token, method, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + p, {
    method: method || (body !== undefined ? "POST" : "GET"),
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function join(base, { email, displayName, password = "password123" }) {
  const res = await api(base, "/api/register", { body: { email, displayName, password } });
  if (res.status !== 201) throw new Error(`join ${email} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

module.exports = { startServer, api, join, FIXTURE };
