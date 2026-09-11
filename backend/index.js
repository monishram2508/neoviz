require("dotenv").config();

const express = require("express");
const cors = require("cors");
const neo4j = require("neo4j-driver");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { authMiddleware, SECRET } = require("./middleware");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.post("/connect", authMiddleware, async (req, res) => {
  let { uri, username, password } = req.body;

  if (!uri && req.body.connectionId) {
    const conn = await new Promise((resolve) => {
      db.get(
        "SELECT uri, username, password FROM connections WHERE id=? AND user_id=?",
        [req.body.connectionId, req.user.id],
        (err, row) => {
          if (err) return resolve(null);
          resolve(row);
        }
      );
    });

    if (!conn) {
      return res.status(400).json({ error: "Connection not found" });
    }

    uri = conn.uri;
    username = conn.username;
    password = conn.password;
  }
  if (!/^neo4j(\+s|\+ssc)?:\/\//.test(uri) && !/^bolt(\+s|\+ssc)?:\/\//.test(uri)) {
    return res.status(400).json({
      error: "Invalid Neo4j URI scheme. Use neo4j:// or neo4j+s://"
    });
  }

  if (!uri || !username || !password) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  const session = driver.session();

  try {
    const result = await session.run("CALL db.labels()");
    const labels = result.records.map((record) => record.get(0));
    res.json({ labels });
  } catch (error) {
    console.error("Error connecting to Neo4j:", error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
    await driver.close();
  }
});
app.post("/query", authMiddleware, async (req, res) => {
  let { cypher, uri, username, password } = req.body;

  if (!uri && req.body.connectionId) {
    const conn = await new Promise((resolve) => {
      db.get(
        "SELECT uri, username, password FROM connections WHERE id=? AND user_id=?",
        [req.body.connectionId, req.user.id],
        (err, row) => {
          if (err) return resolve(null);
          resolve(row);
        }
      );
    });

    if (!conn) {
      return res.status(400).json({ error: "Connection not found" });
    }

    uri = conn.uri;
    username = conn.username;
    password = conn.password;
  }
  if (!/^neo4j(\+s|\+ssc)?:\/\//.test(uri) && !/^bolt(\+s|\+ssc)?:\/\//.test(uri)) {
    return res.status(400).json({
      error: "Invalid Neo4j URI scheme. Use neo4j:// or neo4j+s://"
    });
  }

  if (!cypher || !uri || !username || !password) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  const driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  const session = driver.session();

  try {
    const result = await session.run(cypher);
    const data = result.records.map((record) => record.toObject());
    res.json(data);
  } catch (error) {
    console.error("Error executing query:", error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
    await driver.close();
  }
});

app.post("/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const hashed = await bcrypt.hash(password, 10);

  db.run(
    "INSERT INTO users (email, password) VALUES (?, ?)",
    [email, hashed],
    function (err) {
      if (err) {
        return res.status(400).json({ error: "User already exists" });
      }
      res.json({ success: true });
    }
  );
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user) return res.status(400).json({ error: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Wrong password" });

    const token = jwt.sign({ id: user.id }, SECRET);

    res.json({ token });
  });
});

app.get("/me", authMiddleware, (req, res) => {
  db.get(
    "SELECT neo4j_uri, neo4j_username, neo4j_password FROM users WHERE id = ?",
    [req.user.id],
    (err, user) => {
      if (!user) return res.json({});
      res.json(user);
    }
  );
});

app.get("/connections", authMiddleware, (req, res) => {
  db.all(
    "SELECT id, uri, username, password, name FROM connections WHERE user_id = ?",
    [req.user.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "Failed to fetch connections" });
      }
      res.json(rows);
    }
  );
});

app.post("/save-connection", authMiddleware, (req, res) => {
  const { uri, username, password, name } = req.body;

  db.run(
    `INSERT INTO connections (user_id, uri, username, password, name)
     VALUES (?, ?, ?, ?, ?)`,
    [req.user.id, uri, username, password, name || uri],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to save connection" });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.post("/nl-query", authMiddleware, async (req, res) => {
  const { question, uri, username, password, nodeLabel } = req.body;

  if (!question || !uri || !username || !password) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const Groq = require("groq-sdk");
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    let schemaNote = "";
    if (/^neo4j(\+s|\+ssc)?:\/\//.test(uri) || /^bolt(\+s|\+ssc)?:\/\//.test(uri)) {
      const sDriver = neo4j.driver(uri, neo4j.auth.basic(username, password));
      const sSession = sDriver.session();
      try {

        const lbl = await sSession.run("CALL db.labels()");
        const rel = await sSession.run("CALL db.relationshipTypes()");
        const keys = await sSession.run("CALL db.propertyKeys()");
        schemaNote = `
          THIS DATABASE'S ACTUAL SCHEMA — use ONLY these:
          Node labels: ${lbl.records.map((r) => r.get(0)).join(", ")}
          Relationship types: ${rel.records.map((r) => r.get(0)).join(", ")}
          Property keys: ${keys.records.map((r) => r.get(0)).join(", ")}

          Never invent labels or relationship types not listed above.
          "keywords" and "keywordsUrdu" are STRING ARRAY properties on Work
          nodes (there is no Keyword node or HAS_KEYWORD relationship).
          To match by keyword use:
            any(k IN w.keywords WHERE toLower(k) = toLower("term"))
          To find works sharing keywords with a given work, intersect the
          arrays:
            MATCH (t:Work {title: "X"})
            MATCH (w:Work) WHERE w <> t
              AND any(k IN w.keywords WHERE k IN t.keywords)
            OPTIONAL MATCH (a:Author)-[r:WROTE]->(w)
            RETURN w, r, a LIMIT 50`;
      } catch {} finally
      {await sSession.close();await sDriver.close();}
    }

    const chatResponse = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
      {
        role: "system",
        content: `You are a Neo4j Cypher expert.
          The user is exploring a graph database with node label: ${nodeLabel}.
          Convert the user's question into a valid Cypher query.
          ${schemaNote}

          CRITICAL: the query result is rendered as a visual graph, so it must
          return actual nodes and relationships — never return only a count,
          aggregate, or other scalar value on its own. If the question involves
          a threshold or count (e.g. "nodes with at least N connections"),
          first compute which nodes qualify using a WITH clause, then MATCH
          again from those qualifying nodes to return the real connected nodes
          and relationships. For example, for "magazines with 3 or more
          connections to Work nodes":
            MATCH (m:Magazine)-[r]-(w:Work)
            WITH m, count(w) AS workCount
            WHERE workCount >= 3
            MATCH (m)-[r2]-(w2:Work)
            RETURN m, r2, w2 LIMIT 50

          Return ONLY the Cypher query, no explanation, no markdown, no backticks.
          Always include a LIMIT 50 at the end unless the user specifies otherwise.`
      },
      {
        role: "user",
        content: question
      }]

    });

    const cypher = chatResponse.choices[0].message.content.trim();
    console.log("Generated Cypher:", cypher);

    if (!/^neo4j(\+s|\+ssc)?:\/\//.test(uri) && !/^bolt(\+s|\+ssc)?:\/\//.test(uri)) {
      return res.status(400).json({ error: "Invalid Neo4j URI scheme." });
    }

    const driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
    const session = driver.session();

    try {
      const result = await session.run(cypher);
      const data = result.records.map((record) => record.toObject());
      res.json({ data, cypher });
    } catch (queryError) {
      console.error("Cypher execution error:", queryError);
      res.status(500).json({
        error: "LLM generated an invalid query",
        cypher,
        details: queryError.message
      });
    } finally {
      await session.close();
      await driver.close();
    }

  } catch (err) {
    console.error("Groq error:", err);
    res.status(500).json({ error: "Failed to generate Cypher from question" });
  }
});

app.post("/explain", authMiddleware, async (req, res) => {
  const { question, cypher, summary } = req.body;
  if (!summary) return res.status(400).json({ error: "Missing result summary" });

  try {
    const Groq = require("groq-sdk");
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const chatResponse = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
      {
        role: "system",
        content: `You explain graph-database query results to non-technical users.
          You will receive the user's original question, the Cypher that ran, and a
          summary of the nodes and relationships that came back.

          Write 2-4 plain-English sentences describing what the result shows —
          patterns, counts, notable connections. No jargon, no Cypher talk.

          CRITICAL: every time you mention an entity by name, and that exact name
          appears in the node list you were given, wrap it in double square
          brackets, e.g. [[Jeelani Bano]] or [[Aiwan-e-Ghazal]]. Use the name
          EXACTLY as it appears in the list. Do not wrap anything that is not in
          the node list. Do not use any other formatting.`
      },
      {
        role: "user",
        content: `Question: ${question || "(direct query)"}\nCypher: ${cypher || "(n/a)"}\n\nResult summary:\n${summary}`
      }]

    });

    res.json({ explanation: chatResponse.choices[0].message.content.trim() });
  } catch (err) {
    console.error("Groq explain error:", err);
    res.status(500).json({ error: "Failed to generate explanation" });
  }
});

app.post("/sendContribution", authMiddleware, (req, res) => {
});

app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
