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

Credentials are in `Neo4j-5ac48bc9-Created-2026-05-22.txt` (project root, one level up from `neo/`):
- URI: `neo4j+s://5ac48bc9.databases.neo4j.io`
- Username: `5ac48bc9` (not "neo4j" — the AuraDB username matches the instance ID)
- Password: in the `.txt` file
- **AuraDB Free pauses after 3 days of inactivity** — resume at https://console.neo4j.io before connecting

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

## Design System

All CSS files share a consistent token set defined in `:root` blocks across `auth.css`, `CypherQueryTester.css`, and `configuration.css`. Key tokens:

```css
--bg-base:    #010D1C;   /* deep navy page background */
--accent:     #00d4ff;   /* cyan — buttons, glows, highlights */
--success:    #00e5a0;   /* green — connection status */
--danger:     #f87171;   /* red — errors */
--font-display: 'Syne', sans-serif;
--font-mono:    'Space Mono', monospace;
```

To change the accent color, update `--accent`, `--accent-dim`, and `--accent-border` in all three CSS files, or consolidate into a single `theme.css` (not done yet).

## What's Done vs. Still Needed

**Done:**
- JWT auth, Neo4j connection, dynamic query menu, D3 graph visualization, full graph browse, JSON import, saved connections
- Complete UI redesign (dark navy theme, Syne + Space Mono fonts)
- Phase 1: NL → Cypher via Groq (`/nl-query` endpoint + frontend ASK input)

**Still needed:**
- `ConfigurationView.js` hasn't been redesigned to dark theme yet — "SELECT A NODE TO EXPLORE" heading needs adding
- **Phase 2:** Split-screen layout — D3 graph on left, LLM-generated plain-English explanation of results on right (new Groq call after each query)
- **Phase 3:** Entity highlighting in Phase 2 explanation — clickable terms that fire new graph queries centered on that entity (LLM should tag entities in its response)
- Replace remaining `alert()` popups in `Configuration.js` with inline error UI
- `/sendContribution` endpoint is an empty stub

## Key Gotchas

- **Credentials file mismatch:** The handoff doc says Neo4j username is `"neo4j"` but the actual AuraDB credentials file shows username = `"5ac48bc9"` (matches the instance ID). Use the `.txt` file as truth.
- **Neo4j driver per request:** Each `/query` and `/nl-query` call creates and closes a new `neo4j.driver` instance. This works but is not connection-pooled.
- **D3 in iframe:** The graph lives inside an `<iframe srcDoc={...}>`. To pass data between the iframe and React, use `window.postMessage` (already wired for limit updates).
- **Groq model:** `llama3-70b-8192` — if this model is deprecated, update the model string in `/nl-query` in `backend/index.js`.
- **Database files from original student:** Gadha (prior BTP student) provided a JSON file and a `.cypher` file with literary work data to populate a fresh Neo4j instance. These files were not in this directory — ask the user where they are if needed for database setup.
