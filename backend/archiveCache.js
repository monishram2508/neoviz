const fs = require("fs");
const { readArchive } = require("./archive");
const { normKey } = require("./normalize");
const { config } = require("./config");

const SNAPSHOT = config.archiveSnapshot;

let cache = null;
let loading = null;

const slugify = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

function uniqueSlugger() {
  const seen = new Map();
  return (base) => {
    const s = base || "untitled";
    const n = (seen.get(s) || 0) + 1;
    seen.set(s, n);
    return n === 1 ? s : `${s}-${n}`;
  };
}

const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);

function shapeWork(p, author) {
  return {
    title: p.title || "Untitled",
    year: p.year || null,
    keywords: list(p.keywords),
    keywordsUrdu: list(p.keywordsUrdu),
    engInfo: p.engInfo || null,
    urduInfo: p.urduInfo || null,
    imageCode: p.image || null,
    textCode: p.digitisedText || null,
    genre: p.genre || null,
    magazine: p.magazine || null,
    author: author ? author.name : p.author || null,
    authorSlug: author ? author.slug : null,
    language: author ? author.language : null
  };
}

async function fromNeo4j() {
  const authorRows = await readArchive(
    `MATCH (a:Author)
     OPTIONAL MATCH (a)-[:WROTE]->(w:Work)
     RETURN a AS author, count(w) AS works
     ORDER BY toLower(a.name)`
  );
  const workRows = await readArchive(
    `MATCH (w:Work)
     OPTIONAL MATCH (a:Author)-[:WROTE]->(w)
     OPTIONAL MATCH (w)-[:HAS_GENRE]->(g:Genre)
     OPTIONAL MATCH (w)-[:PUBLISHED_IN]->(m:Magazine)
     RETURN w AS work, a AS author, g.name AS genre, m.name AS magazine
     ORDER BY toLower(w.title)`
  );
  return { authorRows, workRows };
}

function fromSnapshot() {
  const raw = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
  const byId = new Map(raw.nodes.map((n) => [n.nid, n]));
  const authorNodes = raw.nodes.filter((n) => n.labels.includes("Author"));
  const workNodes = raw.nodes.filter((n) => n.labels.includes("Work"));

  const authorOf = new Map();
  const counts = new Map();
  raw.rels
    .filter((r) => r.t === "WROTE")
    .forEach((r) => {
      authorOf.set(r.b, byId.get(r.a));
      counts.set(r.a, (counts.get(r.a) || 0) + 1);
    });

  const extra = new Map();
  raw.rels.forEach((r) => {
    if (r.t !== "HAS_GENRE" && r.t !== "PUBLISHED_IN") return;
    const e = extra.get(r.a) || {};
    e[r.t === "HAS_GENRE" ? "genre" : "magazine"] = (byId.get(r.b) || { p: {} }).p.name || null;
    extra.set(r.a, e);
  });

  return {
    authorRows: authorNodes
      .map((n) => ({ author: n.p, works: counts.get(n.nid) || 0 }))
      .sort((a, b) => a.author.name.toLowerCase().localeCompare(b.author.name.toLowerCase())),
    workRows: workNodes
      .map((n) => {
        const a = authorOf.get(n.nid);
        const e = extra.get(n.nid) || {};
        return { work: n.p, author: a ? a.p : null, genre: e.genre || null, magazine: e.magazine || null };
      })
      .sort((a, b) => a.work.title.toLowerCase().localeCompare(b.work.title.toLowerCase()))
  };
}

function build({ authorRows, workRows }, source) {
  const aSlug = uniqueSlugger();
  const authors = authorRows.map((r) => {
    const p = r.author;
    return {
      slug: aSlug(slugify(p.name)),
      name: p.name,
      language: p.language || null,
      bio: p.bio || null,
      workCount: Number(r.works) || 0,
      portrait: null
    };
  });
  const authorByName = new Map(authors.map((a) => [String(a.name).trim().toLowerCase(), a]));

  const wSlug = uniqueSlugger();
  const works = workRows.map((r) => {
    const linked = r.author ? authorByName.get(String(r.author.name).trim().toLowerCase()) : null;
    const w = shapeWork(r.work, linked);
    w.genre = r.genre || w.genre;
    w.magazine = r.magazine || w.magazine;
    w.slug = wSlug(slugify(w.title));
    w.orphan = !linked;
    w.keyIndex = new Set(w.keywords.map(normKey).filter(Boolean));
    return w;
  });

  const vocab = new Map();
  works.forEach((w) =>
    w.keywords.forEach((k) => {
      const key = normKey(k);
      if (!key) return;
      const e = vocab.get(key) || { key, surfaces: new Map(), count: 0 };
      e.surfaces.set(k.trim(), (e.surfaces.get(k.trim()) || 0) + 1);
      e.count += 1;
      vocab.set(key, e);
    })
  );
  const vocabulary = [...vocab.values()]
    .map((e) => ({
      key: e.key,
      label: [...e.surfaces.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      count: e.count
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    authors,
    works,
    vocabulary,
    meta: {
      source,
      loadedAt: new Date().toISOString(),
      authors: authors.length,
      works: works.length,
      keywords: vocabulary.length
    }
  };
}

async function load({ force = false } = {}) {
  if (cache && !force) return cache;
  if (loading) return loading;
  loading = (async () => {
    try {
      cache = build(await fromNeo4j(), "neo4j");
    } catch (err) {
      if (!fs.existsSync(SNAPSHOT)) throw err;
      cache = build(fromSnapshot(), "snapshot");
      cache.meta.neo4jError = err.code || err.message;
    } finally {
      loading = null;
    }
    return cache;
  })();
  return loading;
}

function selectWorks(data, selected, mode) {
  const keys = selected.map(normKey).filter(Boolean);
  if (!keys.length) return data.works;
  const test = mode === "any"
    ? (w) => keys.some((k) => w.keyIndex.has(k))
    : (w) => keys.every((k) => w.keyIndex.has(k));
  return data.works.filter(test);
}

function facetsFor(data, works, selected) {
  const chosen = new Set(selected.map(normKey).filter(Boolean));
  const counts = new Map();
  works.forEach((w) => w.keyIndex.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));
  const labels = new Map(data.vocabulary.map((v) => [v.key, v.label]));
  return [...counts.entries()]
    .filter(([k]) => !chosen.has(k))
    .map(([key, count]) => ({ key, label: labels.get(key) || key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const publicWork = (w) => ({
  slug: w.slug,
  title: w.title,
  year: w.year,
  author: w.author,
  authorSlug: w.authorSlug,
  language: w.language,
  genre: w.genre,
  magazine: w.magazine,
  keywords: w.keywords,
  keywordsUrdu: w.keywordsUrdu,
  engInfo: w.engInfo,
  urduInfo: w.urduInfo,
  hasScan: Boolean(w.imageCode),
  hasText: Boolean(w.textCode),
  orphan: w.orphan
});

module.exports = { load, selectWorks, facetsFor, publicWork, slugify, SNAPSHOT };
