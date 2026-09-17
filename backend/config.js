const path = require("path");
const fs = require("fs");

require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });

const ROOT = __dirname;

const asBool = (v, fallback) => {
  if (v === undefined || v === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(v));
};

const config = {
  root: ROOT,
  port: Number(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || "development",

  dbFile: process.env.DB_FILE ?
  path.resolve(ROOT, process.env.DB_FILE) :
  path.join(ROOT, "users.db"),

  uploadDir: process.env.UPLOAD_DIR ?
  path.resolve(ROOT, process.env.UPLOAD_DIR) :
  path.join(ROOT, "uploads"),

  frontendBuild: process.env.FRONTEND_BUILD ?
  path.resolve(ROOT, process.env.FRONTEND_BUILD) :
  path.join(ROOT, "..", "frontend", "build"),

  jwtSecret: process.env.JWT_SECRET,
  groqKey: process.env.GROQ_API_KEY,

  archive: {
    uri: process.env.ARCHIVE_NEO4J_URI,
    username: process.env.ARCHIVE_NEO4J_USERNAME,
    password: process.env.ARCHIVE_NEO4J_PASSWORD
  },

  moderatorEmails: (process.env.MODERATOR_EMAILS || "").
  split(",").
  map((e) => e.trim().toLowerCase()).
  filter(Boolean),

  corsOrigin: process.env.CORS_ORIGIN || "*",
  serveFrontend: asBool(process.env.SERVE_FRONTEND, process.env.NODE_ENV === "production")
};

function checkConfig() {
  const missing = [];
  if (!config.jwtSecret) missing.push("JWT_SECRET");

  if (missing.length) {
    console.error("\n  Cannot start: missing required settings\n");
    missing.forEach((k) => console.error(`    ${k}`));
    console.error(`\n  Add them to ${path.join(ROOT, ".env")}`);
    console.error(`  Copy .env.example to .env and fill it in.\n`);
    process.exit(1);
  }

  const warn = [];
  if (!config.archive.uri) warn.push("ARCHIVE_NEO4J_URI — contribution and archive endpoints will return 503");
  if (!config.groqKey) warn.push("GROQ_API_KEY — natural-language queries will fail");
  if (!config.moderatorEmails.length) warn.push("MODERATOR_EMAILS — nobody will be seeded as a moderator");
  if (warn.length) {
    console.warn("  Starting with limited functionality:");
    warn.forEach((w) => console.warn(`    ${w}`));
  }

  fs.mkdirSync(config.uploadDir, { recursive: true });
}

module.exports = { config, checkConfig };
