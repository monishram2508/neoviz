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
      error: "Invalid Neo4j URI scheme. Use neo4j:// or neo4j+s://",
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
      error: "Invalid Neo4j URI scheme. Use neo4j:// or neo4j+s://",
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
    function(err) {
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
    function(err) {
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

    const chatResponse = await groq.chat.completions.create({
      model: "llama3-70b-8192",
      messages: [
        {
          role: "system",
          content: `You are a Neo4j Cypher expert. 
          The user is exploring a graph database with node label: ${nodeLabel}.
          Convert the user's question into a valid Cypher query.
          Return ONLY the Cypher query, no explanation, no markdown, no backticks.
          Always include a LIMIT 50 at the end unless the user specifies otherwise.`
        },
        {
          role: "user",
          content: question
        }
      ]
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

app.post("/sendContribution", authMiddleware, (req, res) => {
});

app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
