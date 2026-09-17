#!/usr/bin/env node
/**
 * Benchmarks LLMs on natural-language-to-Cypher against the NeoViz archive.
 *
 *   node run_eval.js                      run every enabled model
 *   node run_eval.js --discover           list callable models, write nothing
 *   node run_eval.js --validate-gold      run only the gold queries, check they work
 *   node run_eval.js --models a,b         restrict to these model ids
 *   node run_eval.js --prompt plain       swap the system prompt profile
 *   node run_eval.js --limit 5            first N gold questions only
 *   node run_eval.js --dry-run            generate Cypher, execute nothing
 */

const fs = require("fs");
const path = require("path");
const { connect, runRead, fetchSchema } = require("./lib/db");
const { generate, discover } = require("./lib/providers");
const { score } = require("./lib/score");
const { PROMPTS, buildPrompt } = require("./lib/prompts");

const HERE = __dirname;
const RESULTS = path.join(HERE, "results");

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const a = { flags: new Set(), opts: {} };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { a.opts[key] = next; i++; }
    else a.flags.add(key);
  }
  return a;
}

// ------------------------------------------------------------------- config

function loadEnv() {
  // Works whether this directory sits inside the app repo or beside it.
  const candidates = [
    process.env.EVAL_ENV_FILE,
    path.join(HERE, ".env"),
    path.join(HERE, "..", "backend", ".env"),
    path.join(HERE, "..", "v4", "backend", ".env")
  ].filter(Boolean);

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    fs.readFileSync(file, "utf8").split("\n").forEach((line) => {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
      if (!m) return;
      const key = m[1];
      let val = m[2].trim().replace(/^["']|["']$/g, "");
      if (process.env[key] === undefined) process.env[key] = val;
    });
    return file;
  }
  return null;
}

const loadJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

function loadGold(limit) {
  const file = path.join(HERE, "gold.jsonl");
  if (!fs.existsSync(file)) throw new Error(`No gold set at ${file}`);
  const rows = fs.readFileSync(file, "utf8")
    .split("\n").map((l) => l.trim()).filter(Boolean)
    .map((l, i) => {
      try { return JSON.parse(l); }
      catch (e) { throw new Error(`gold.jsonl line ${i + 1} is not valid JSON: ${e.message}`); }
    });
  const seen = new Set();
  rows.forEach((r) => {
    if (!r.id) throw new Error("every gold row needs an id");
    if (seen.has(r.id)) throw new Error(`duplicate gold id: ${r.id}`);
    seen.add(r.id);
    if (!r.question || !r.cypher) throw new Error(`gold ${r.id} is missing question or cypher`);
  });
  return limit ? rows.slice(0, Number(limit)) : rows;
}

// ---------------------------------------------------------------- reporting

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const toCsv = (rows, cols) =>
  [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";

function pct(n, d) { return d === 0 ? "—" : ((100 * n) / d).toFixed(1) + "%"; }

function summarise(rows, models, gold) {
  const byDiff = [...new Set(gold.map((g) => g.difficulty || "unknown"))];
  return models.map((m) => {
    const mine = rows.filter((r) => r.model === m.id);
    const n = mine.length;
    const s = {
      model: m.id,
      provider: m.provider,
      n,
      exact: mine.filter((r) => r.exact_match === true).length,
      entity: mine.filter((r) => r.entity_match === true).length,
      complete: mine.filter((r) => r.entity_complete === true).length,
      gen_errors: mine.filter((r) => r.gen_error).length,
      exec_errors: mine.filter((r) => r.exec_error).length,
      blocked: mine.filter((r) => r.blocked_write).length,
      mean_latency_ms: n ? Math.round(mine.reduce((a, r) => a + (Number(r.gen_latency_ms) || 0), 0) / n) : 0,
      mean_jaccard: n ? (mine.reduce((a, r) => a + (Number(r.entity_jaccard) || 0), 0) / n).toFixed(3) : "0",
      mean_recall: n ? (mine.reduce((a, r) => a + (Number(r.entity_recall) || 0), 0) / n).toFixed(3) : "0"
    };
    s.exact_pct = pct(s.exact, n);
    s.entity_pct = pct(s.entity, n);
    s.complete_pct = pct(s.complete, n);
    byDiff.forEach((d) => {
      const sub = mine.filter((r) => r.difficulty === d);
      s[`exact_${d}`] = pct(sub.filter((r) => r.exact_match === true).length, sub.length);
      s[`complete_${d}`] = pct(sub.filter((r) => r.entity_complete === true).length, sub.length);
    });
    return s;
  });
}

function printTable(summary, gold) {
  const diffs = [...new Set(gold.map((g) => g.difficulty || "unknown"))];
  const cols = [
    ["model", 26], ["n", 3], ["exact_pct", 9], ["complete_pct", 12],
    ["mean_recall", 11], ["gen_errors", 10], ["exec_errors", 11],
    ["blocked", 7], ["mean_latency_ms", 15]
  ];
  const head = cols.map(([c, w]) => c.padEnd(w)).join(" ");
  console.log("\n" + head);
  console.log("-".repeat(head.length));
  summary.forEach((s) => console.log(cols.map(([c, w]) => String(s[c]).padEnd(w)).join(" ")));

  console.log("\nfound every gold entity (entity_complete), by difficulty");
  const dh = ["model".padEnd(30), ...diffs.map((d) => d.padEnd(10))].join(" ");
  console.log(dh);
  console.log("-".repeat(dh.length));
  summary.forEach((s) =>
    console.log([s.model.padEnd(30), ...diffs.map((d) => String(s[`complete_${d}`]).padEnd(10))].join(" ")));
}

// -------------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv);
  const envFile = loadEnv();

  if (args.flags.has("discover")) {
    console.log("Callable models right now:\n");
    const d = await discover();
    Object.entries(d).forEach(([prov, list]) => {
      console.log(`  ${prov}`);
      list.forEach((m) => console.log(`      ${m}`));
      console.log("");
    });
    console.log("Copy the ones you want into models.json.");
    return;
  }

  console.log(envFile ? `config: ${envFile}` : "config: no .env found, using process environment");

  const gold = loadGold(args.opts.limit);
  const cfg = loadJson(path.join(HERE, "models.json"));
  const promptName = args.opts.prompt || "production";
  if (!PROMPTS[promptName]) {
    throw new Error(`Unknown prompt profile "${promptName}". Available: ${Object.keys(PROMPTS).join(", ")}`);
  }

  let models = (cfg.models || []).filter((m) => m.enabled !== false);
  if (args.opts.models) {
    const want = new Set(args.opts.models.split(",").map((s) => s.trim()));
    models = (cfg.models || []).filter((m) => want.has(m.id));
    const missing = [...want].filter((w) => !models.some((m) => m.id === w));
    if (missing.length) throw new Error(`Not in models.json: ${missing.join(", ")}`);
  }

  const validateOnly = args.flags.has("validate-gold");
  if (!validateOnly && !models.length) {
    throw new Error("No models enabled. Edit models.json, or run --discover to see what is callable.");
  }

  // ---- connect ----
  let driver = null;
  const dryRun = args.flags.has("dry-run");
  if (!dryRun) {
    try {
      driver = await connect({
        uri: process.env.ARCHIVE_NEO4J_URI,
        username: process.env.ARCHIVE_NEO4J_USERNAME,
        password: process.env.ARCHIVE_NEO4J_PASSWORD
      });
      console.log(`connected: ${process.env.ARCHIVE_NEO4J_URI}`);
    } catch (err) {
      console.error("\n" + err.message + "\n");
      process.exit(2);
    }
  }

  // ---- validate gold only ----
  if (validateOnly) {
    console.log(`\nvalidating ${gold.length} gold queries\n`);
    let bad = 0;
    for (const g of gold) {
      const r = await runRead(driver, g.cypher);
      const expected = g.expected_rows;
      const mismatch = expected !== undefined && r.ok && r.records.length !== expected;
      if (!r.ok || mismatch) bad++;
      const status = !r.ok ? "ERROR " : mismatch ? "ROWS? " : "ok    ";
      const detail = !r.ok ? r.error
        : mismatch ? `${r.records.length} rows, gold says ${expected}`
        : `${r.records.length} rows`;
      console.log(`  ${status} ${g.id}  ${String(g.difficulty).padEnd(6)} ${detail}`);
    }
    console.log(bad ? `\n${bad} of ${gold.length} gold queries need attention.`
                    : `\nAll ${gold.length} gold queries run and match their expected row counts.`);
    await driver.close();
    process.exit(bad ? 1 : 0);
  }

  // ---- schema for the prompt ----
  // Cached on every successful connection so --dry-run still gets a real
  // schema when the database is unreachable, which is when you most need it.
  const schemaCache = path.join(HERE, "schema-cache.json");
  let schema;
  if (driver) {
    schema = await fetchSchema(driver);
    fs.writeFileSync(schemaCache, JSON.stringify({ at: new Date().toISOString(), ...schema }, null, 2));
  } else if (fs.existsSync(schemaCache)) {
    const c = loadJson(schemaCache);
    schema = { labels: c.labels, relationshipTypes: c.relationshipTypes, propertyKeys: c.propertyKeys };
    console.log(`schema: from cache (${c.at ? c.at.slice(0, 10) : "unknown date"}) — database not connected`);
  } else {
    schema = { labels: [], relationshipTypes: [], propertyKeys: [] };
    console.log("schema: EMPTY — no database and no cache, so the prompt has no schema to work from");
  }
  const systemPrompt = buildPrompt(promptName, schema);
  console.log(`prompt profile: ${promptName}`);
  console.log(`gold questions: ${gold.length}`);
  console.log(`models: ${models.map((m) => m.id).join(", ")}\n`);

  // ---- gold results, once ----
  const goldResults = {};
  if (!dryRun) {
    for (const g of gold) {
      goldResults[g.id] = await runRead(driver, g.cypher);
      if (!goldResults[g.id].ok) {
        console.warn(`  warning: gold ${g.id} failed to run — ${goldResults[g.id].error}`);
      }
    }
  }

  // ---- the run ----
  const defaults = cfg.defaults || {};
  const rows = [];
  for (const m of models) {
    process.stdout.write(`${m.id}\n`);
    for (const g of gold) {
      const gen = await generate({
        provider: m.provider,
        model: m.model,
        prompt: systemPrompt,
        question: g.question,
        temperature: m.temperature ?? defaults.temperature ?? 0,
        maxTokens: m.maxTokens ?? defaults.maxTokens ?? 600,
        timeoutMs: m.timeoutMs ?? defaults.timeoutMs ?? 60000
      });

      const row = {
        model: m.id, provider: m.provider, model_name: m.model,
        qid: g.id, difficulty: g.difficulty || "", category: g.category || "",
        question: g.question,
        gold_cypher: g.cypher, generated_cypher: gen.cypher,
        gen_error: gen.ok ? "" : gen.error,
        gen_latency_ms: gen.ms,
        exec_error: "", blocked_write: false,
        exact_match: "", entity_match: "", entity_complete: "", entity_recall: "", entity_jaccard: "",
        gold_rows: "", gen_rows: "", gold_exec_ms: "", gen_exec_ms: ""
      };

      if (!dryRun && gen.ok && gen.cypher) {
        const gr = goldResults[g.id];
        const cr = await runRead(driver, gen.cypher);
        row.blocked_write = cr.blocked === true;
        row.exec_error = cr.ok ? "" : cr.error;
        row.gen_exec_ms = cr.ms;
        row.gold_exec_ms = gr.ms;
        if (gr.ok && cr.ok) {
          const s = score(gr.records, cr.records);
          Object.assign(row, s);
        } else {
          row.exact_match = false;
          row.entity_match = false;
          row.entity_complete = false;
          row.entity_recall = 0;
          row.entity_jaccard = 0;
          row.gold_rows = gr.ok ? gr.records.length : "";
          row.gen_rows = cr.ok ? cr.records.length : "";
        }
      } else if (gen.ok && !gen.cypher) {
        row.gen_error = "model returned no parseable Cypher";
      }

          const mark = row.exact_match === true ? "="
        : row.entity_complete === true ? "+"
        : row.gen_error ? "E"
        : row.blocked_write ? "W"
        : row.exec_error ? "!"
        : "x";
      process.stdout.write(mark);
      rows.push(row);
    }
    process.stdout.write("\n");
  }

  if (driver) await driver.close();

  // ---- write ----
  fs.mkdirSync(RESULTS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const detailCols = ["model", "provider", "model_name", "qid", "difficulty", "category",
    "exact_match", "entity_match", "entity_complete", "entity_recall", "entity_jaccard",
    "gold_rows", "gen_rows",
    "gen_error", "exec_error", "blocked_write", "gen_latency_ms", "gold_exec_ms", "gen_exec_ms",
    "question", "gold_cypher", "generated_cypher"];
  const detailFile = path.join(RESULTS, `results-${stamp}.csv`);
  fs.writeFileSync(detailFile, toCsv(rows, detailCols));

  const summary = summarise(rows, models, gold);
  const sumCols = Object.keys(summary[0] || { model: "" });
  const sumFile = path.join(RESULTS, `summary-${stamp}.csv`);
  fs.writeFileSync(sumFile, toCsv(summary, sumCols));

  fs.writeFileSync(path.join(RESULTS, `run-${stamp}.json`), JSON.stringify({
    at: new Date().toISOString(), promptProfile: promptName, dryRun,
    goldCount: gold.length, models: models.map((m) => m.id), schema, summary
  }, null, 2));

  printTable(summary, gold);
  console.log(`\nper-query : ${path.relative(process.cwd(), detailFile)}`);
  console.log(`summary   : ${path.relative(process.cwd(), sumFile)}`);
  console.log("\nlegend:  = exact   + found every gold entity   x wrong   ! query errored   E generation failed   W blocked as a write");
  console.log("\nexact_pct is strict: shape and content must match.");
  console.log("complete_pct asks only whether the model found every entity gold found, ignoring");
  console.log("extras. That is the fairer read under the production prompt, which REQUIRES");
  console.log("returning whole nodes for graph rendering instead of a bare projection.");
}

main().catch((err) => {
  console.error("\n" + (err && err.message ? err.message : err) + "\n");
  process.exit(1);
});
