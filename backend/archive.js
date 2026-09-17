const neo4j = require("neo4j-driver");
const { normKey } = require("./normalize");
const { config } = require("./config");

let driver = null;

function archiveDriver() {
  const { uri, username: user, password: pass } = config.archive;
  if (!uri || !user || !pass) {
    const err = new Error(
      "Archive database is not configured on the server. Set ARCHIVE_NEO4J_URI, ARCHIVE_NEO4J_USERNAME and ARCHIVE_NEO4J_PASSWORD."
    );
    err.status = 503;
    throw err;
  }
  if (!driver) driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  return driver;
}

const plain = (v) => {
  if (v === null || v === undefined) return v;
  if (neo4j.isInt(v)) return v.toNumber();
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "object" && v.properties) return plain(v.properties);
  if (typeof v === "object") {
    const o = {};
    Object.keys(v).forEach((k) => (o[k] = plain(v[k])));
    return o;
  }
  return v;
};

async function readArchive(cypher, params = {}) {
  const session = archiveDriver().session({ defaultAccessMode: neo4j.session.READ });
  try {
    const res = await session.run(cypher, params);
    return res.records.map((r) => plain(r.toObject()));
  } finally {
    await session.close();
  }
}

async function writeArchive(statements) {
  const session = archiveDriver().session({ defaultAccessMode: neo4j.session.WRITE });
  const tx = session.beginTransaction();
  try {
    const counters = [];
    for (const [cypher, params] of statements) {
      const res = await tx.run(cypher, params || {});
      counters.push(res.summary.counters.updates());
    }
    await tx.commit();
    return counters;
  } catch (err) {
    await tx.rollback();
    throw err;
  } finally {
    await session.close();
  }
}

async function vocabulary() {
  const rows = await readArchive(`
    MATCH (w:Work) WHERE w.keywords IS NOT NULL
    UNWIND w.keywords AS raw
    WITH trim(raw) AS surface, w
    WHERE surface <> ""
    RETURN surface, count(DISTINCT w) AS works
    ORDER BY works DESC, surface ASC
  `);

  const byKey = new Map();
  rows.forEach(({ surface, works }) => {
    const key = normKey(surface);
    if (!key) return;
    const prev = byKey.get(key);
    if (!prev || works > prev.works) byKey.set(key, { surface, works, key });
  });
  return [...byKey.values()].sort((a, b) => b.works - a.works || a.surface.localeCompare(b.surface));
}

async function vocabularyMap() {
  const map = new Map();
  (await vocabulary()).forEach((v) => map.set(v.key, v.surface));
  return map;
}

async function findWork(title) {
  const rows = await readArchive(
    `MATCH (w:Work) WHERE toLower(trim(w.title)) = $t
     RETURN w.title AS title, w.author AS author, w.keywords AS keywords,
            w.keywordsUrdu AS keywordsUrdu`,
    { t: String(title || "").trim().toLowerCase() }
  );
  return rows[0] || null;
}

async function close() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

module.exports = { archiveDriver, readArchive, writeArchive, vocabulary, vocabularyMap, findWork, close };
