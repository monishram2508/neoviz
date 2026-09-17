# ⬡ NeoViz

![React](https://img.shields.io/badge/React-Frontend-61DAFB?style=flat-square&logo=react)
![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?style=flat-square&logo=node.js)
![Neo4j](https://img.shields.io/badge/Neo4j-Graph_DB-4581C3?style=flat-square&logo=neo4j)
![Groq](https://img.shields.io/badge/Groq-LLaMA_3-orange?style=flat-square)
![JWT](https://img.shields.io/badge/Auth-JWT-black?style=flat-square)

**Graph databases, made human.**

NeoViz is a schema-agnostic web application for exploring and visualizing Neo4j property graphs — no Cypher knowledge required. Connect to any Neo4j instance, browse its structure interactively, and query it in plain English using AI-powered natural language processing.

Built as part of a research project at the [Data Science and Analytics Centre (DSAC)](https://dsac.iiit.ac.in/), continuing work originally started under BTP 2025/26.

---

## Features

- **Schema-agnostic exploration** — automatically detects node labels and relationship types from any Neo4j database, no configuration needed
- **Interactive D3 graph visualization** — force-directed graph rendering with draggable nodes, zoom, and relationship traversal
- **Natural language queries** — type a question in plain English and NeoViz converts it to Cypher using an LLM, then runs and visualizes the result
- **Dynamic query menus** — auto-generated query options based on incoming and outgoing relationships for the selected node label
- **JSON import** — upload a JSON file and push it directly into your Neo4j database
- **Manual node/relationship creation** — add nodes and relationships through the UI without writing Cypher
- **JWT authentication** — secure login and registration with token-based auth and local SQLite user storage
- **Saved connections** — store and reuse Neo4j connection credentials across sessions

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, D3.js, React Router |
| Backend | Node.js, Express.js |
| Graph Database | Neo4j (AuraDB or self-hosted) |
| Auth Database | SQLite |
| Authentication | JWT (jsonwebtoken), bcrypt |
| AI / NL Queries | Groq API (LLaMA 3 70B) |

---

## Project Structure

```
neoviz/
├── frontend/
│   └── src/
│       ├── App.js                          # routing
│       ├── index.js                        # entry point
│       ├── Auth/
│       │   ├── Login.js
│       │   ├── Register.js
│       │   └── auth.css
│       └── CypherQueryTester/
│           ├── Configuration.js            # Neo4j connection + node selection
│           ├── CypherQueryTester.js        # main graph page
│           ├── CypherQueryTester.css
│           ├── configuration.css
│           ├── JsonImport.js               # JSON → Neo4j import
│           ├── components/
│           │   ├── ConfigurationView.js
│           │   └── SimpleSelect.js
│           └── utils/
│               ├── buildResultsPageContent.js   # D3 graph renderer
│               ├── cypherQueryApi.js
│               └── configurationUtils.js
└── backend/
    ├── index.js                            # Express server + all API routes
    ├── middleware.js                       # JWT auth middleware
    ├── db.js                               # SQLite setup
    └── users.db                            # generated at runtime
```

---

## Getting Started

### Prerequisites

- Node.js v18 or higher
- npm
- A Neo4j database — [AuraDB Free](https://neo4j.com/cloud/aura) works and requires no local setup
- A [Groq API key](https://console.groq.com) (free, optional) for natural language queries

### Installation

```bash
git clone https://github.com/monishram2508/neoviz.git
cd neoviz/v4

cd backend  && npm ci
cd ../frontend && npm ci
```

Use `npm ci` rather than `npm install` — it installs the exact versions in the
lockfile, so every machine gets an identical tree. `bcrypt` and `sqlite3` are
native modules and are compiled during install, so the machine needs build
tools (`build-essential` on Debian/Ubuntu, Xcode command line tools on macOS).

### Configuration

All settings live in one file. Copy the template and fill it in:

```bash
cd backend
cp .env.example .env
```

`JWT_SECRET` is the only setting the server refuses to start without. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Everything else is optional — the server starts and tells you which features
are unavailable. `.env.example` documents every key.

### Running in development

Two terminals:

```bash
# Terminal 1
cd backend && npm start

# Terminal 2
cd frontend && npm start
```

The frontend proxies API calls to the backend automatically (the `proxy` field
in `frontend/package.json`), so nothing needs configuring and there are no CORS
problems. Open http://localhost:3000.

### Running in production

Build the frontend, then let the backend serve it. One process, one port, one origin:

```bash
cd frontend && npm run build
cd ../backend && NODE_ENV=production PORT=8080 npm start
```

The whole application is then on `http://localhost:8080` — the site at `/`, the
API under `/api`. Put nginx or Apache in front of it for TLS and a domain name.

To keep it running across reboots, use a process manager such as `systemd` or
`pm2`. The server resolves its database and upload paths relative to its own
location, not the working directory, so it can be started from anywhere.

### Moving it to another machine

Everything machine-specific is in `backend/.env`; nothing else needs editing.

| What | Where it lives | Notes |
|---|---|---|
| Configuration | `backend/.env` | Never committed. Copy `.env.example` and fill in. |
| User accounts, submissions | `backend/users.db` | SQLite file. Copy it to keep accounts; delete it to start clean — it is recreated on boot. |
| Uploaded files | `backend/uploads/` | Copy alongside `users.db`; the two reference each other. |
| The archive itself | Neo4j | Separate service. Point `ARCHIVE_NEO4J_*` at it. |

`DB_FILE`, `UPLOAD_DIR` and `FRONTEND_BUILD` can be overridden in `.env` to
point at a persistent disk when deploying.

Port 7687 must be reachable for Neo4j. Some networks block it — see Notes.

## Usage

### 1. Register and log in
Create an account at `/register`, then sign in at `/login`.

### 2. Connect to Neo4j
Enter your Neo4j connection URI, username, and password on the configuration page. The URI format for AuraDB is:

```
neo4j+s://xxxxxxxx.databases.neo4j.io
```

> **Note:** Neo4j uses port 7687 (Bolt protocol). Some institutional networks block this port. Use a personal hotspot if you're on a university network and the connection fails.

### 3. Explore the graph
After connecting, NeoViz fetches all available node labels from your database and displays them as clickable cards. Select one to open the graph explorer.

### 4. Run queries
- Use the **predefined query dropdown** to select relationship-based queries auto-generated from your schema
- Use the **Ask** input to type a question in plain English — NeoViz will convert it to Cypher and visualize the result
- The generated Cypher is displayed below the input so you can verify what was run

### 5. Import data
Navigate to the JSON import page to upload structured data and push it into your Neo4j database.

---

## Notes

- The SQLite database (`users.db`) is generated automatically on first run inside the `backend/` folder
- Neo4j AuraDB Free instances pause automatically after 3 days of inactivity — resume them from the [Aura Console](https://console.neo4j.io) before connecting
- The Groq free tier is sufficient for natural language queries at typical usage levels

---

## Acknowledgements

Original codebase by a 4th year student under BTP 2025/26. Continued and extended as part of ongoing research at DSAC.
