# NL-to-Cypher evaluation harness

Benchmarks language models on translating natural-language questions into
Cypher, against the live NeoViz archive graph (273 nodes: literary works by
South Asian women authors).

Standalone. Nothing here imports from or modifies `v4/`.

## Quick start

```bash
npm install
npm run discover            # what models can this machine actually call?
npm run validate-gold       # do the reference queries run and return what they claim?
npm run eval                # the benchmark
```

Configuration is read from `../backend/.env` automatically — no duplicate
setup. Override with `EVAL_ENV_FILE=/path/to/.env`, or put a `.env` here.

Needs `ARCHIVE_NEO4J_URI`, `ARCHIVE_NEO4J_USERNAME`, `ARCHIVE_NEO4J_PASSWORD`,
and `GROQ_API_KEY` for Groq models. Ollama needs no key, just a running daemon.

## Options

| Flag | Effect |
|---|---|
| `--discover` | List callable Groq and Ollama models, write nothing |
| `--validate-gold` | Run only the gold queries; check they execute and match `expected_rows` |
| `--models a,b` | Restrict to these model ids from `models.json` |
| `--prompt plain` | Use the neutral prompt instead of the app's production one |
| `--limit 5` | First N gold questions only |
| `--dry-run` | Generate Cypher, execute nothing (works with the database down) |

## How scoring works

For each (model, question): generate Cypher → safety gate → execute gold and
candidate → canonicalise → compare.

### Canonicalisation

Applied identically to both sides before comparing:

- Neo4j `Integer` → JS number; temporal types → string
- Node → its property map, element id discarded
- Relationship → `{type, properties}`
- **Arrays are sorted.** Cypher's `collect()` has no guaranteed order without an
  explicit `ORDER BY`, so positional comparison produces false negatives. The
  cost is that a question genuinely about ordering *inside a list* cannot be
  scored strictly.
- Floats rounded to 6 decimal places; strings whitespace-normalised
- **A row becomes a sorted tuple of its values.** Column names and column order
  are discarded, because `RETURN w.title AS title` and `... AS workTitle` are
  the same answer.
- **A result is a multiset of rows.** Row order is ignored; duplicate rows are
  significant.

### Three metrics, because no single one is honest here

| Metric | Asks | Fails when |
|---|---|---|
| `exact_match` | Identical multisets? | Correct answer in a different projection |
| `entity_match` | Same set of entities? | Candidate returns extra context |
| `entity_complete` | Did it find everything gold found? | Candidate genuinely missed rows |

`entity_recall` and `entity_jaccard` give the underlying numbers for partial
credit.

The third metric exists because of something the first run revealed. Asked
*"which works did Fatima Alam Ali write?"*, the model produced:

```cypher
MATCH (a:Author {name: "Fatima Alam Ali"})-[r:WROTE]->(w:Work) RETURN a, r, w LIMIT 50
```

That is correct, and it is what the production prompt **demands** — results are
rendered as a graph, so the prompt forbids bare projections. But gold returns
`w.title`, so `exact_match` fails on shape, and `entity_match` fails too because
the author node is an extra entity. Only `entity_complete` reports it as right.

**Read them together.** High completeness with low exact means the model is
correct but shaped differently. Low completeness means it is actually wrong.

### Safety

Generated Cypher runs against the real archive. Everything executes in a **read
transaction**, and any query matching write clauses (`CREATE`, `MERGE`,
`DELETE`, `SET`, `REMOVE`, `DROP`, `FOREACH`, `LOAD CSV`, writing `CALL {}`) or
restricted procedures is **refused before execution** and recorded as
`blocked_write`. String literals and comments are stripped first, so
`WHERE w.title = "DELETE ME"` is correctly allowed.

## Where "execution accuracy" is ambiguous on this schema

These are properties of the data, not harness bugs. Each one means a reasonable
person could write two different correct queries that return different rows.

1. **`year` is a string.** 121 of 162 works have one; values include `"1976"`,
   `"1944-11-05"`, `"Not Dated"`, `"Various Years"`, `"1926-1929"` and `""`.
   Only **43** are clean four-digit years. "Before 1950" has at least three
   defensible implementations. Gold pins the rule in the question text.

2. **Authorship is stored twice and the two disagree.** There is a `w.author`
   string *and* `(:Author)-[:WROTE]->(:Work)`. **16 works have the string but no
   relationship.** 2 works have two author nodes. 2 have `w.author` ≠
   `Author.name`. "Works by X" is a different set depending on the path taken.
   This is the largest ambiguity in the schema; `q20` tests it directly.

3. **Same split for genre and magazine.** 64 works carry `w.genre`, only 54 have
   `HAS_GENRE`. One disagrees outright: property `"Short Stories"` vs node
   `"Short Story"` — and both exist as separate `Genre` nodes.

4. **Genre is not a clean taxonomy**: `Short Story`, `Short Stories`,
   `Collection of Short Stories`, `Collection of Short Stories by different
   authors`, `Collection`. "How many short-story works" has no single answer.

5. **104 of 162 works have an empty `keywords` array.** Keyword questions range
   over 58 works, not 162.

6. **Duplicate entities.** `Mundadugu` exists as two `Work` nodes with
   conflicting years; `Chalapathi Vijayvardhanam` as two `Author` nodes.
   Questions touching them return two rows where a human expects one.

7. **The production prompt forbids what some questions ask for.** It instructs
   the model never to return a bare count or aggregate. The gold set contains
   aggregation questions by design, so those will fail under
   `--prompt production` and largely pass under `--prompt plain`. That gap is a
   real finding about the app, not a defect here. Run both and compare.

8. **`LIMIT 50` is injected by the production prompt.** Where a gold answer
   would exceed 50 rows, gold pins `LIMIT` too, or the model is penalised for
   obeying its instructions.

## The gold set

`gold.jsonl`, one JSON object per line:

| Field | Meaning |
|---|---|
| `id` | Stable identifier, e.g. `q07` |
| `question` | What the model is asked |
| `cypher` | Reference query |
| `difficulty` | `easy` / `medium` / `hard` |
| `category` | `single-hop` / `multi-hop` / `filter` / `aggregation` |
| `expected_rows` | Optional; `--validate-gold` checks against it |
| `notes` | Ambiguities and conventions — read before editing |

20 questions: 6 easy, 11 medium, 3 hard; 5 each of single-hop, multi-hop,
filter and aggregation.

> **These are candidates, not gold.** They were written by inspecting a schema
> dump and have **not been executed against the live database** — the instance
> was unreachable throughout. Run `npm run validate-gold` first. Any row
> reporting `ERROR` or `ROWS?` needs correcting before the numbers mean
> anything. The `expected_rows` values are derived from the 14 September backup,
> so they will drift if the archive changes.

## Output

Written to `results/`, timestamped:

- `results-<stamp>.csv` — one row per (model, question) with both queries, all
  metrics, errors and latencies
- `summary-<stamp>.csv` — execution accuracy per model
- `run-<stamp>.json` — the full run including the schema and prompt profile used

## Adding a model

Edit `models.json`. `npm run discover` lists what is callable. Groq and Ollama
both speak the OpenAI chat format, so a new provider is an entry in
`lib/providers.js`, not a new dependency.

Note the Groq free tier carries **no Llama chat models** as of September 2026.
`whisper-*` are speech, `llama-prompt-guard-*` are safety classifiers; neither
is usable here.
