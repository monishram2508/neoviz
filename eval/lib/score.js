const neo4j = require("neo4j-driver");

const isNode = (v) => v && typeof v === "object" && v.labels !== undefined && v.properties !== undefined;
const isRel = (v) => v && typeof v === "object" && v.type !== undefined && v.properties !== undefined && v.start !== undefined;
const isPath = (v) => v && typeof v === "object" && Array.isArray(v.segments);

const round6 = (n) => Math.round(n * 1e6) / 1e6;
const normStr = (s) => String(s).replace(/\s+/g, " ").trim();

/**
 * Reduce one Neo4j value to a comparable plain form.
 *
 * Arrays are SORTED. Cypher's collect() has no guaranteed order without an
 * explicit ORDER BY, so comparing them positionally produces false negatives.
 * The cost: a question genuinely about ordering inside a list cannot be scored
 * strictly. That trade is recorded in the README.
 */
function canonValue(v) {
  if (v === null || v === undefined) return null;
  if (neo4j.isInt(v)) return v.toNumber();
  if (neo4j.isDate?.(v) || neo4j.isDateTime?.(v) || neo4j.isLocalDateTime?.(v) ||
      neo4j.isTime?.(v) || neo4j.isLocalTime?.(v) || neo4j.isDuration?.(v)) {
    return String(v);
  }
  if (Array.isArray(v)) {
    return v.map(canonValue).map(stable).sort().map((s) => JSON.parse(s));
  }
  if (isNode(v)) return { _n: canonProps(v.properties) };
  if (isRel(v)) return { _r: String(v.type), p: canonProps(v.properties) };
  if (isPath(v)) return { _p: v.segments.map((s) => canonValue(s.relationship)) };
  if (typeof v === "number") return Number.isFinite(v) ? round6(v) : String(v);
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return normStr(v);
  if (typeof v === "object") return canonProps(v);
  return v;
}

function canonProps(p) {
  const out = {};
  Object.keys(p || {}).sort().forEach((k) => { out[k] = canonValue(p[k]); });
  return out;
}

/** Deterministic JSON: object keys sorted at every depth. */
function stable(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
}

/**
 * One row becomes a SORTED tuple of its values; column names and column order
 * are discarded. `RETURN w.title AS title` and `... AS workTitle` are the same
 * answer and must score the same.
 */
function canonRow(record) {
  const obj = typeof record.toObject === "function" ? record.toObject() : record;
  return Object.values(obj).map(canonValue).map(stable).sort();
}

/** A result is a MULTISET of rows — duplicates are meaningful. */
function canonResult(records) {
  return (records || []).map((r) => stable(canonRow(r))).sort();
}

function multisetEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Every identifying string anywhere in the result: `title`/`name` on returned
 * nodes, plus bare string scalars. Lets `RETURN w` and `RETURN w.title` compare
 * equal, which strict matching cannot do.
 */
function entityKeys(records) {
  const keys = new Set();
  const walk = (v) => {
    if (v === null || v === undefined) return;
    if (neo4j.isInt(v)) return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (isNode(v)) {
      const p = v.properties || {};
      const id = p.title ?? p.name;
      if (id !== undefined && id !== null) keys.add(normStr(id).toLowerCase());
      return;
    }
    if (isRel(v) || isPath(v)) return;
    if (typeof v === "string") {
      const s = normStr(v);
      if (s) keys.add(s.toLowerCase());
      return;
    }
    if (typeof v === "object") Object.values(v).forEach(walk);
  };
  (records || []).forEach((r) => {
    const obj = typeof r.toObject === "function" ? r.toObject() : r;
    Object.values(obj).forEach(walk);
  });
  return keys;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  a.forEach((x) => { if (b.has(x)) inter++; });
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

/**
 * Compare a candidate result against gold. Three metrics, because no single
 * one is honest on this schema:
 *
 *   exact_match   strict multiset equality. Measures shape AND content, so a
 *                 correct answer in a different projection fails.
 *
 *   entity_match  set equality of identifying strings. Survives projection
 *                 differences, but still fails when the candidate returns
 *                 extra context.
 *
 *   entity_recall did the candidate find everything gold found, ignoring
 *                 extras. This is the fair metric under the production prompt,
 *                 which REQUIRES returning whole nodes for graph rendering —
 *                 so a correct answer legitimately carries the author node
 *                 alongside the works and would be penalised otherwise.
 *
 * Read them together: high recall with low exact means the model is right but
 * shaped differently; low recall means it is actually wrong.
 */
function score(goldRecords, genRecords) {
  const g = canonResult(goldRecords);
  const c = canonResult(genRecords);
  const gk = entityKeys(goldRecords);
  const ck = entityKeys(genRecords);
  const j = jaccard(gk, ck);

  let found = 0;
  gk.forEach((k) => { if (ck.has(k)) found++; });
  const recall = gk.size === 0 ? (ck.size === 0 ? 1 : 0) : found / gk.size;

  return {
    exact_match: multisetEqual(g, c),
    entity_match: gk.size === ck.size && j === 1,
    entity_recall: round6(recall),
    entity_complete: recall === 1,
    entity_jaccard: round6(j),
    gold_rows: g.length,
    gen_rows: c.length
  };
}

module.exports = { score, canonResult, canonRow, canonValue, entityKeys, jaccard, stable };
