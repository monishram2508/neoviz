# ⬡ NeoViz

![React](https://img.shields.io/badge/React-Frontend-61DAFB?style=flat-square&logo=react)
![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?style=flat-square&logo=node.js)
![Neo4j](https://img.shields.io/badge/Neo4j-Graph_DB-4581C3?style=flat-square&logo=neo4j)
![Groq](https://img.shields.io/badge/Groq-LLaMA_3-orange?style=flat-square)
![JWT](https://img.shields.io/badge/Auth-JWT-black?style=flat-square)

**Graph databases, made human.**

NeoViz is a schema-agnostic web application for exploring and visualizing Neo4j property graphs — no Cypher knowledge required. Connect to any Neo4j instance, browse its structure interactively, and query it in plain English using AI-powered natural language processing.

Built as part of a research project at the [Data Science and Analytics Centre (DSAC)](https://dsac.in), continuing work originally started under BTP 2025/26.

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

- Node.js v14 or higher
- npm
- A Neo4j database — [AuraDB Free](https://neo4j.com/cloud/aura) works and requires no local setup
- A [Groq API key](https://console.groq.com) (free) for natural language queries

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/yourusername/neoviz.git
cd neoviz
```

**2. Install backend dependencies**

```bash
cd backend
npm install
```

**3. Install frontend dependencies**

```bash
cd ../frontend
npm install
```

**4. Set up environment variables**

Create a `.env` file inside the `backend/` folder:

```env
GROQ_API_KEY=your_groq_api_key_here
```

### Running the App

**Start the backend** (from the `backend/` folder):

```bash
export JWT_SECRET=your_secret_key_here
node index.js
```

The backend runs on `http://localhost:3001`.

**Start the frontend** (from the `frontend/` folder):

```bash
npm start
```

You can now view frontend in the browser.
```
  Local:            http://localhost:3000
  On Your Network:  http://<your_ip>:3000
```
---

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
