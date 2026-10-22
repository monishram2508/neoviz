const fs = require("fs");
const path = require("path");
const express = require("express");
const { config } = require("./config");
const publicRouter = require("./public");
const { load, SNAPSHOT } = require("./archiveCache");

const BUILD_DIR = config.frontendBuild;
const INDEX_HTML = path.join(BUILD_DIR, "index.html");

function requireBuild() {
  if (fs.existsSync(INDEX_HTML)) return;
  console.error(`\n  No site build found at:\n    ${BUILD_DIR}\n`);
  console.error("  Build it with:  cd ../frontend && npm run build\n");
  process.exit(1);
}

async function loadArchive() {
  try {
    return await load();
  } catch (err) {
    console.error(`\n  Could not load the archive: ${err.message}`);
    console.error(`  Looked for a snapshot at:\n    ${SNAPSHOT}\n`);
    process.exit(1);
  }
}

function sourceLine(meta) {
  const counts = `${meta.authors} authors, ${meta.works} works, ${meta.keywords} keywords`;
  return meta.source === "neo4j"
    ? `  Data: live Neo4j (${counts})`
    : `  Data: offline snapshot (${counts})`;
}

function buildApp() {
  const app = express();
  app.use("/api/public", publicRouter);
  app.use(express.static(BUILD_DIR));
  app.get("*", (req, res) => res.sendFile(INDEX_HTML));
  return app;
}

async function start() {
  requireBuild();
  const { meta } = await loadArchive();

  const server = buildApp().listen(config.port, () => {
    console.log("\n  Bayaaz-e-Hayaat  —  demo server");
    console.log(sourceLine(meta));
    if (meta.neo4jError && config.archive.uri) {
      console.log(`  (live database not reached, using the snapshot: ${meta.neo4jError})`);
    }
    console.log(`\n  Open this in your browser:\n    http://localhost:${config.port}\n`);
    console.log("  Press Control-C here to stop.\n");
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n  Port ${config.port} is already in use.`);
      console.error("  Either the demo is open in another window, or something else has that port.");
      console.error(`  Try a different one:  PORT=4174 ./START-HERE.command\n`);
    } else {
      console.error(`\n  Server error: ${err.message}\n`);
    }
    process.exit(1);
  });
}

start().catch((err) => {
  console.error(`\n  Failed to start: ${err.message}\n`);
  process.exit(1);
});
