const express = require("express");
const { load, selectWorks, facetsFor, publicWork } = require("./archiveCache");

const router = express.Router();

const parseKeywords = (q) =>
  String(q || "")
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  res.status(err.status || 503).json({ error: err.message || "Archive unavailable" });
});

router.get("/meta", wrap(async (req, res) => {
  const data = await load();
  res.json(data.meta);
}));

router.get("/authors", wrap(async (req, res) => {
  const data = await load();
  res.json({
    authors: data.authors.map((a) => ({
      slug: a.slug,
      name: a.name,
      language: a.language,
      workCount: a.workCount,
      hasBio: Boolean(a.bio),
      portrait: a.portrait
    }))
  });
}));

router.get("/authors/:slug", wrap(async (req, res) => {
  const data = await load();
  const author = data.authors.find((a) => a.slug === req.params.slug);
  if (!author) return res.status(404).json({ error: "No such author" });
  const works = data.works.filter((w) => w.authorSlug === author.slug).map(publicWork);
  res.json({ author: { ...author, portraits: [] }, works });
}));

router.get("/works", wrap(async (req, res) => {
  const data = await load();
  const selected = parseKeywords(req.query.kw);
  const mode = req.query.mode === "any" ? "any" : "all";
  const matched = selectWorks(data, selected, mode);

  const language = req.query.language;
  const filtered = language ? matched.filter((w) => w.language === language) : matched;

  const limit = Math.min(Number(req.query.limit) || 60, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  res.json({
    total: filtered.length,
    offset,
    limit,
    works: filtered.slice(offset, offset + limit).map(publicWork),
    selected: selected.map((s) => ({ label: s })),
    facets: facetsFor(data, filtered, selected).slice(0, 120),
    mode
  });
}));

router.get("/works/:slug", wrap(async (req, res) => {
  const data = await load();
  const work = data.works.find((w) => w.slug === req.params.slug);
  if (!work) return res.status(404).json({ error: "No such work" });
  const author = data.authors.find((a) => a.slug === work.authorSlug) || null;
  res.json({
    work: { ...publicWork(work), images: [] },
    author: author ? { slug: author.slug, name: author.name, bio: author.bio } : null
  });
}));

router.get("/keywords", wrap(async (req, res) => {
  const data = await load();
  res.json({ keywords: data.vocabulary });
}));

router.get("/graph", wrap(async (req, res) => {
  const data = await load();
  const selected = parseKeywords(req.query.kw);
  const mode = req.query.mode === "any" ? "any" : "all";
  const works = selectWorks(data, selected, mode).slice(0, 300);

  const authorSlugs = new Set(works.map((w) => w.authorSlug).filter(Boolean));
  const nodes = [
    ...data.authors
      .filter((a) => authorSlugs.has(a.slug))
      .map((a) => ({ id: `a:${a.slug}`, kind: "author", label: a.name, slug: a.slug, language: a.language })),
    ...works.map((w) => ({
      id: `w:${w.slug}`,
      kind: "work",
      label: w.title,
      slug: w.slug,
      language: w.language,
      year: w.year
    }))
  ];
  const links = works
    .filter((w) => w.authorSlug)
    .map((w) => ({ source: `a:${w.authorSlug}`, target: `w:${w.slug}` }));

  res.json({ nodes, links, truncated: works.length >= 300 });
}));

module.exports = router;
