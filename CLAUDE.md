# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: NeoViz

Schema-agnostic Neo4j graph explorer. Users connect to any Neo4j database, browse its nodes/relationships, and visualize them as an interactive D3 force-directed graph. The app auto-discovers the database structure — it works with any Neo4j data without hardcoded schema knowledge.

## Running Locally

**Requires two terminals. Backend must start first.**

```bash
# Terminal 1 — backend (port 3001)
cd backend
export JWT_SECRET=any_secret_string
node index.js

# Terminal 2 — frontend (port 3000)
cd frontend
npm start
```

Backend requires a `backend/.env` file:
```
GROQ_API_KEY=your_groq_key_here
```

**Safari note:** Use `http://127.0.0.1:3000` instead of `localhost:3000` — Safari has HTTPS issues with localhost.

**University WiFi note:** Neo4j uses port 7687 (Bolt protocol), which is blocked on campus WiFi. Must use mobile hotspot to connect to AuraDB.

## Neo4j Instance

The user's own AuraDB instance (created July 2026, populated from `neo4j_dump_fixed.cypher`):
- URI: `neo4j+s://98adb721.databases.neo4j.io`
- Username: `98adb721` (AuraDB usernames match the instance ID, not "neo4j")
- Password: saved in the app's SQLite `connections` table (`backend/users.db`)
- **AuraDB Free pauses after 3 days of inactivity** — resume at https://console.neo4j.io before connecting. While resuming, DNS for the hostname doesn't resolve (`ENOTFOUND`) — that's normal for 1–3 minutes.
- Data: 268 nodes of literary works (South Asian women authors — Urdu/Telugu) with bios, languages, relationships.

## Architecture

```
frontend/src/
  App.js                          # route definitions only
  Auth/
    Login.js / Register.js        # auth pages, shared auth.css
  CypherQueryTester/
    Configuration.js              # Neo4j credential entry + label selection page
    CypherQueryTester.js          # main graph exploration page
    JsonImport.js                 # JSON → Cypher → Neo4j import tool
    components/
      ConfigurationView.js        # node label grid renderer (subcomponent)
      SimpleSelect.js             # custom dropdown
    utils/
      buildResultsPageContent.js  # builds self-contained D3 HTML injected into iframe
      cypherQueryApi.js           # all frontend → backend fetch calls
      configurationUtils.js       # config page fetch helpers

backend/
  index.js      # all Express routes
  middleware.js # JWT auth guard (authMiddleware)
  db.js         # SQLite schema init (users + connections tables)
  users.db      # auto-generated SQLite file
```

## Request Flow

1. **Auth:** `/login` → JWT → stored in `localStorage["token"]` → sent as `Authorization: Bearer <token>` on all subsequent requests
2. **Connect:** `POST /connect` → runs `CALL db.labels()` on Neo4j → returns label strings for the node grid
3. **Query:** `POST /query` with a Cypher string → runs against Neo4j → JSON records returned
4. **NL Query:** `POST /nl-query` → Groq (LLaMA 3 70B) converts plain English to Cypher → runs that Cypher → returns `{ data, cypher }`
5. **Graph render:** `buildResultsPageContent.js` converts query records into a self-contained HTML+D3 document → injected into an `<iframe>` via `srcDoc` → iframe communicates back via `window.postMessage`

## Backend API

All routes require JWT except `/register` and `/login`.

| Route | Method | Purpose |
|---|---|---|
| `/register` | POST | Create user (bcrypt hashed password → SQLite) |
| `/login` | POST | Returns JWT token |
| `/connect` | POST | Validate Neo4j creds, return node labels |
| `/query` | POST | Run raw Cypher, return records |
| `/nl-query` | POST | NL → Groq → Cypher → Neo4j → returns `{ data, cypher }` |
| `/save-connection` | POST | Save Neo4j connection to SQLite |
| `/connections` | GET | List saved connections for user |
| `/me` | GET | Current user info |
| `/sendContribution` | POST | Empty stub — not implemented |

## Design System (v3 — light neutral)

All CSS files share a consistent token set defined in `:root` blocks across `auth.css`, `CypherQueryTester.css`, and `configuration.css`. Key tokens:

```css
--bg: #fafafa;        /* page background */
--surface: #ffffff;   /* cards, navbar, panel */
--border: #e4e4e7;    /* hairline borders */
--text-1: #18181b;    /* primary text (zinc-900) */
--accent: #4f46e5;    /* indigo — primary buttons, focus rings */
--green: #16a34a;     /* connection status */
--danger: #dc2626;    /* errors */
--font: 'Inter';  --font-mono: 'JetBrains Mono';
```

Node label colors come from a deterministic hash palette duplicated in `buildResultsPageContent.js`, `ConfigurationView.js`, and `CypherQueryTester.js` (PALETTE) — a label gets the same color everywhere. Change all three together.

Graph page layout: navbar (breadcrumbs, label switcher, connection pill) / left graph iframe / right 320px collapsible panel (node inspector + NL query). The collapse toggle tab lives in `.graph-body`, *outside* the panel, so it's never clipped when collapsed.

## What's Done vs. Still Needed

**Done:**
- JWT auth, Neo4j connection, dynamic query menu, D3 graph visualization, full graph browse, JSON import, saved connections
- Complete UI redesign (dark navy theme, Syne + Space Mono fonts)
- Phase 1: NL → Cypher via Groq (`/nl-query` endpoint + frontend ASK input)

**v4 — keyword features (Bayaaz-e-Hayaat literary archive):**

Keywords live as an array property on `Work` nodes (`keywords` English, `keywordsUrdu` Urdu, positionally aligned). They are deliberately *not* modelled as nodes — 86% of curated keywords appear on only one work, so promoting them would produce a hairball.

The right panel is tabbed: **Inspect** (the original node detail + NL query), **Keywords**, **Compare**.

- *Find keywords → their works*: every keyword chip (Inspect tab, Keywords tab list, Compare tab shared-keyword chips) calls `toggleKeyword()`, which adds or removes that keyword from `activeKeywords` and re-runs `worksWithKeywordsQuery(kws, mode)`. That query pulls each work **plus its author via `OPTIONAL MATCH (a:Author)-[r:WROTE]->(w)`** — without the author the result is unlinked nodes and D3 renders a scatter instead of a graph.
- *Compare works → shared keywords*: clicking a Work in the graph while the Compare tab is active stores `{title, author, keywords}` in `sessionStorage["neoviz_compare"]`. The intersection is computed client-side from properties already in hand, so no extra round-trip. Splits results into "In all N" and "In some".
- *Normalisation*: `normKey()` in `CypherQueryTester.js` mirrors `canon.py` in the import pipeline — NFKC, curly→straight quotes, en/em dash→hyphen, whitespace collapse, strip edge punctuation (including Urdu `،` `۔`), lowercase. **Change both together or search silently breaks.** Cypher matching also uses `toLower(trim(k))` as a second line of defence.

Data pipeline lives in `data/`: `Bayaaz-e-Hayaat Metadata_Keywords.xlsx` (Nazia's sheet, the source of truth) → `import_keywords_sept.cypher` (generated). `backup_keywords_before_sept_import.json` is the rollback snapshot of keyword state prior to the September import.

**v4 additions (September 2026):**
- **Dark mode**: `src/theme.js` stamps `data-theme` on `<html>`; every CSS file has a `:root[data-theme="dark"]` token override block plus scoped fixes for hardcoded colors. The iframe gets its theme via `buildResultsPageContent(data, { theme })` — theme switches re-render the last result set from `lastRecordsRef`. Toggle lives in the graph navbar; persisted in `localStorage["neoviz_theme"]`.
- **Compare redesign**: with the Compare tab active, clicking a Work in the graph toggles it in/out of the comparison (amber ring + ✓ badge, updated live via `COMPARE_SET` postMessage — no rebuild). Non-Work nodes are ignored in this mode. "Show only selected" renders a synthetic client-side graph: selected works joined by undirected links labeled "N shared", thickness ∝ shared-keyword count (`weight`/`undirected` fields on link entries).
- **Node search** (navbar): debounced CONTAINS search over `name`/`title` across all labels; picking a result runs a jump query (node + its neighborhood). Root query now has `ORDER BY toLower(coalesce(n.name, n.title))` so the default sample is deterministic — this fixed the "Sughra Humayun Mirza missing from default view" issue.
- **Phase 2+3 (done)**: `/explain` endpoint — after each NL query the frontend sends a compact node/relationship summary; the model returns 2–4 sentences with entity names wrapped in `[[ ]]`, rendered as clickable buttons that fire jump queries.
- **Groq model**: `llama-3.3-70b-versatile` was REMOVED from free-tier keys (Sept 2026, "enterprise pricing" only) — both endpoints now use `openai/gpt-oss-120b`. `/nl-query` also injects the live schema (`db.labels()`, `db.relationshipTypes()`, `db.propertyKeys()`, run sequentially — one session can't run parallel queries) into the system prompt so the model can't hallucinate relationship types; includes explicit guidance that keywords are array properties, not Keyword nodes.
- **404 page**: `NotFound.js` on the `*` route, theme-aware.
- Keyword display is first-letter-capitalised via `displayKw()` — display only, matching still uses `normKey`.

**Multi-keyword filter (September 14 2026):**

The Keywords tab is a *faceted* filter, not a single-keyword lookup. `activeKeywords` is an array; `kwMode` is `"all"` (default, intersect) or `"any"` (union). The Cypher is built by `worksWithKeywordsQuery`:

```
WITH [toLower("a"), toLower("b")] AS sel
MATCH (w:Work) WHERE w.keywords IS NOT NULL
  AND all(t IN sel WHERE any(k IN w.keywords WHERE toLower(trim(k)) = t))
```

**Why faceting is not optional:** 602 of 729 keywords (83%) sit on exactly one work, so most keyword pairs intersect to *nothing*. A plain multi-select would hand users an empty graph almost every time. So after each query `worksFromRecords()` extracts the matching `Work` nodes, `facetCounts` recounts every keyword **within that result set**, and the browse list is filtered to those keywords with the narrowed counts. A keyword that would produce zero results is therefore not in the list to be clicked. Verified against live data: the facet count predicts the subsequent AND result exactly, at one, two and three keywords deep. Faceting is skipped in `"any"` mode, where adding a keyword broadens rather than narrows.

Breadcrumbs: consecutive keyword filters *replace* the top nav entry rather than stacking (`type: "keyword"`, carries `kws` so `jumpTo` can restore the selection). Any non-keyword navigation (`resetToRoot`, `switchLabel`, `handleExpand`, `jumpToEntity`, NL query) clears the filter via `setKws([])`.

Compare-tab shared keywords are ranked **rarest-first by archive frequency** (`vocabCount`), not alphabetically, and anything at or above `hubThreshold` (60% of the most common keyword's count) is dimmed as a hub. Two works sharing "Hyderabad" (17 works) is noise; sharing "Autobiographical subjectivity" (2 works) is the finding. Each chip shows its archive frequency and clicking it feeds the keyword filter — that is what turns compare from a dead-end list into a research move.

**Contribution + moderation backend (September 14 2026):**

Public-archive groundwork, backend only — no UI yet.

- `backend/normalize.js` — the server-side twin of `normKey`/`canon.py`. `cleanSurface`, `normKey`, `cleanList`, `cleanPair` (dedupes EN/UR **as pairs** so translations stay positionally aligned), `canonicalise` (snaps a submitted keyword onto the archive's existing spelling), `mergeKeywords`. **Three copies of this logic now exist** (Python import script, frontend, backend) — change them together.
- `backend/archive.js` — server-side Neo4j connection read from `ARCHIVE_NEO4J_*` env vars. The frontend never sees these. `vocabulary()` returns the canonical keyword list with the most-frequent surface form winning; `writeArchive()` runs statements in a single transaction that rolls back on failure.
- `backend/submissions.js` — the router. Submissions are staged in **SQLite, never in Neo4j**: a pending contribution must not be able to pollute anyone's query results, and rejecting one must be a row update, not graph surgery. Types are `add_keywords` and `new_work`. `GET /submissions/:id/preview` shows the moderator exactly what approving will do — which keywords match existing vocabulary, which are new to the archive, before/after counts, duplicate-title warnings — and `POST /submissions/:id/decide` executes *those same statements*. `keywordOverrides` on the decide call lets the moderator map a new keyword onto an existing one before it enters the vocabulary. All graph writes are parameterised; nothing is string-interpolated into Cypher.
- Roles live in `users.role` (`reader`/`contributor`/`moderator`), looked up **from the database on every request** (`loadRole`) rather than trusted from the JWT, so a demotion takes effect immediately and old tokens can't carry stale privileges. `MODERATOR_EMAILS` in `.env` seeds moderators at boot and at registration.
- Uploads: multer → `backend/uploads/` (gitignored), 20 MB cap, extension allowlist, random filenames. Rejected uploads are unlinked, not left on disk.

**Still needed:**
- Frontend for the above: `/contribute`, `/my-submissions`, `/moderate` pages
- Phase B of uploads — the copyright question (can contributors upload full texts of in-copyright works?) must be settled with Nazia before building it
- The app still sends the user's own Neo4j credentials from the browser with every query. That is fine while the user *is* the admin, but **must be replaced by the server-side archive connection before any public signup**, or a contributor would hold write access to the whole archive.
- `Mundadugu` exists twice in the DB with conflicting years (1945 vs 1980) and two variant author nodes ("Sunkara and Vasireddi" vs "Sunkara Satyanarayana and V. Bhaskara Rao") — needs a human decision, likely Nazia's team
- Replace remaining `alert()` popups in `Configuration.js` with inline error UI
- `/sendContribution` endpoint is an empty stub

## Key Gotchas

- **Credentials file mismatch:** The handoff doc says Neo4j username is `"neo4j"` but the actual AuraDB credentials file shows username = `"5ac48bc9"` (matches the instance ID). Use the `.txt` file as truth.
- **Neo4j driver per request:** Each `/query` and `/nl-query` call creates and closes a new `neo4j.driver` instance. This works but is not connection-pooled.
- **D3 in iframe:** The graph lives inside an `<iframe srcDoc={...}>`. To pass data between the iframe and React, use `window.postMessage` (already wired for limit updates).
- **Groq model:** `openai/gpt-oss-120b`. Free-tier keys lost *all* Llama chat models in September 2026. Check live availability with `GET https://api.groq.com/openai/v1/models` — the docs page still lists models the free tier cannot use.
- **`JWT_SECRET`** now has a fallback in `backend/.env`, so the server no longer crashes when it isn't exported. An exported value still takes precedence (dotenv does not override `process.env`).
- **Graph iframe contract:** iframe → parent messages: `NODE_CLICK {node}`, `NODE_DESELECT`; parent → iframe: `COMPARE_SET {titles}`. The graph pre-settles its force simulation (sim.stop() + manual ticks) before first paint, then fades in — don't reintroduce live-settling on load, it looks chaotic.
- **Root query pattern:** `MATCH (n:\`Label\`) WITH n LIMIT 15 OPTIONAL MATCH (n)-[r]-(m) RETURN n, r, m` — the OPTIONAL MATCH is what makes relationships appear on the initial view.
- **Database files from original student:** Gadha (prior BTP student) provided a JSON file and a `.cypher` file with literary work data to populate a fresh Neo4j instance. These files were not in this directory — ask the user where they are if needed for database setup.
