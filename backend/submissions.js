const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const db = require("./db");
const { authMiddleware, loadRole, requireRole } = require("./middleware");
const { cleanSurface, normKey, cleanPair, canonicalise, mergeKeywords } = require("./normalize");
const archive = require("./archive");

const router = express.Router();

const { config } = require("./config");

const UPLOAD_DIR = config.uploadDir;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = new Set([".txt", ".md", ".pdf", ".doc", ".docx", ".rtf", ".odt"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_KEYWORDS = 400;
const TYPES = new Set(["new_work", "add_keywords"]);
const STATUSES = new Set(["pending", "approved", "rejected", "changes_requested"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) =>
      cb(null, crypto.randomBytes(16).toString("hex") + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new Error(`Unsupported file type "${ext}". Allowed: ${[...ALLOWED_EXT].join(", ")}`));
    }
    cb(null, true);
  }
});

const dropFile = (file) => {
  if (file?.path) fs.unlink(file.path, () => {});
};

const parseList = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string") return [];
  const t = v.trim();
  if (!t) return [];
  if (t.startsWith("[")) {
    try {
      const p = JSON.parse(t);
      if (Array.isArray(p)) return p;
    } catch {}
  }
  return t.split(/[\n,؛;]+/);
};

function validate(type, body) {
  const errors = [];
  const payload = {};

  if (type === "add_keywords") {
    const target = cleanSurface(body.workTitle ?? body.target);
    if (!target) errors.push("workTitle is required");
    payload.workTitle = target;
  } else {
    payload.title = cleanSurface(body.title);
    payload.author = cleanSurface(body.author);
    if (!payload.title) errors.push("title is required");
    if (!payload.author) errors.push("author is required");
    ["year", "genre", "language", "magazine"].forEach((k) => {
      const v = cleanSurface(body[k]);
      if (v) payload[k] = v;
    });
    ["engInfo", "urduInfo"].forEach((k) => {
      const v = String(body[k] ?? "").trim();
      if (v) payload[k] = v.slice(0, 8000);
    });
  }

  const pair = cleanPair(parseList(body.keywords), parseList(body.keywordsUrdu));
  if (pair.en.length > MAX_KEYWORDS) errors.push(`Too many keywords (max ${MAX_KEYWORDS})`);
  if (type === "add_keywords" && !pair.en.length) errors.push("At least one keyword is required");
  payload.keywords = pair.en;
  if (pair.ur.length) payload.keywordsUrdu = pair.ur;
  if (!pair.aligned) payload.keywordsAligned = false;

  const note = String(body.note ?? "").trim();
  if (note) payload.note = note.slice(0, 2000);

  return { errors, payload };
}

const rowToSubmission = (row) => ({
  id: row.id,
  type: row.type,
  target: row.target,
  status: row.status,
  payload: JSON.parse(row.payload),
  file: row.file_name ? { name: row.file_name, size: row.file_size } : null,
  submittedBy: row.email || undefined,
  userId: row.user_id,
  moderatorNote: row.moderator_note,
  createdAt: row.created_at,
  decidedAt: row.decided_at
});

// ---------------------------------------------------------------- submitting

router.post("/submissions", authMiddleware, loadRole, upload.single("file"), (req, res) => {
  const type = String(req.body.type || "").trim();
  if (!TYPES.has(type)) {
    dropFile(req.file);
    return res.status(400).json({ error: `type must be one of: ${[...TYPES].join(", ")}` });
  }

  const { errors, payload } = validate(type, req.body);
  if (errors.length) {
    dropFile(req.file);
    return res.status(400).json({ error: errors.join("; "), errors });
  }

  const target = type === "add_keywords" ? payload.workTitle : payload.title;

  db.run(
    `INSERT INTO submissions (user_id, type, target, payload, file_name, file_path, file_size)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      req.account.id,
      type,
      target,
      JSON.stringify(payload),
      req.file ? req.file.originalname : null,
      req.file ? req.file.filename : null,
      req.file ? req.file.size : null
    ],
    function (err) {
      if (err) {
        dropFile(req.file);
        return res.status(500).json({ error: "Failed to save submission" });
      }
      res.status(201).json({ id: this.lastID, status: "pending", type, target, payload });
    }
  );
});

router.get("/submissions/mine", authMiddleware, loadRole, (req, res) => {
  db.all(
    `SELECT * FROM submissions WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
    [req.account.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(rows.map(rowToSubmission));
    }
  );
});

// ------------------------------------------------------------- moderator queue

router.get("/submissions", requireRole("moderator"), (req, res) => {
  const status = req.query.status;
  if (status && !STATUSES.has(status)) {
    return res.status(400).json({ error: `status must be one of: ${[...STATUSES].join(", ")}` });
  }
  const where = status ? "WHERE s.status = ?" : "";
  db.all(
    `SELECT s.*, u.email FROM submissions s LEFT JOIN users u ON u.id = s.user_id
     ${where} ORDER BY s.created_at DESC, s.id DESC`,
    status ? [status] : [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });
      res.json(rows.map(rowToSubmission));
    }
  );
});

const loadSubmission = (req, res, next) => {
  db.get(
    `SELECT s.*, u.email FROM submissions s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!row) return res.status(404).json({ error: "Submission not found" });
      const mine = row.user_id === req.account.id;
      if (!mine && req.account.role !== "moderator") {
        return res.status(403).json({ error: "Not your submission" });
      }
      req.submission = row;
      next();
    }
  );
};

router.get("/submissions/:id", authMiddleware, loadRole, loadSubmission, (req, res) => {
  res.json(rowToSubmission(req.submission));
});

router.get("/submissions/:id/file", authMiddleware, loadRole, loadSubmission, (req, res) => {
  const row = req.submission;
  if (!row.file_path) return res.status(404).json({ error: "No file attached" });
  const full = path.join(UPLOAD_DIR, path.basename(row.file_path));
  if (!fs.existsSync(full)) return res.status(404).json({ error: "File is missing from disk" });
  res.download(full, row.file_name);
});

// --------------------------------------------------- what approving will do

async function buildPlan(row, overrides = {}) {
  const payload = JSON.parse(row.payload);
  const vocabMap = await archive.vocabularyMap();

  const overrideMap = new Map();
  Object.entries(overrides || {}).forEach(([k, v]) => {
    const key = normKey(k);
    const val = cleanSurface(v);
    if (key && val) overrideMap.set(key, val);
  });

  const submitted = payload.keywords || [];
  const resolved = [];
  const matchedExisting = [];
  const remapped = [];
  const newToArchive = [];

  submitted.forEach((surface) => {
    const key = normKey(surface);
    if (overrideMap.has(key)) {
      const to = overrideMap.get(key);
      remapped.push({ submitted: surface, canonical: to });
      resolved.push(to);
      return;
    }
    const existing = vocabMap.get(key);
    if (existing) {
      if (existing !== surface) matchedExisting.push({ submitted: surface, canonical: existing });
      resolved.push(existing);
      return;
    }
    newToArchive.push(surface);
    resolved.push(surface);
  });

  const warnings = [];
  if (payload.keywordsAligned === false) {
    warnings.push(
      `English (${(payload.keywords || []).length}) and Urdu (${(payload.keywordsUrdu || []).length}) keyword lists are different lengths, so they cannot be paired up. Only the English list will be written.`
    );
  }
  const writeUrdu =
    payload.keywordsAligned !== false &&
    Array.isArray(payload.keywordsUrdu) &&
    payload.keywordsUrdu.length === submitted.length;

  const statements = [];
  const plan = {
    type: row.type,
    keywords: { submitted: submitted.length, matchedExisting, remapped, newToArchive },
    warnings
  };

  if (row.type === "add_keywords") {
    const work = await archive.findWork(payload.workTitle);
    if (!work) {
      warnings.push(`No work titled "${payload.workTitle}" exists in the archive — approving would fail.`);
      plan.work = null;
      plan.blocked = true;
      return { plan, statements, payload };
    }

    const before = work.keywords || [];
    const beforeKeys = new Set(before.map(normKey));
    const willAdd = resolved.filter((k) => !beforeKeys.has(normKey(k)));
    const alreadyOnWork = resolved.filter((k) => beforeKeys.has(normKey(k)));
    const after = mergeKeywords(before, resolved);

    plan.work = { title: work.title, author: work.author, keywordsBefore: before.length, keywordsAfter: after.length };
    plan.keywords.willAdd = willAdd;
    plan.keywords.alreadyOnWork = alreadyOnWork;
    if (!willAdd.length) warnings.push("Every submitted keyword is already on this work — approving changes nothing.");

    const sets = ["w.keywords = $keywords"];
    const params = { t: work.title.trim().toLowerCase(), keywords: after, by: row.email || String(row.user_id) };
    if (writeUrdu) {
      sets.push("w.keywordsUrdu = $keywordsUrdu");
      params.keywordsUrdu = mergeKeywords(work.keywordsUrdu || [], payload.keywordsUrdu);
    }
    sets.push("w.lastContributionBy = $by", "w.lastContributionAt = datetime()");
    statements.push([
      `MATCH (w:Work) WHERE toLower(trim(w.title)) = $t\nSET ${sets.join(", ")}\nRETURN w.title AS title`,
      params
    ]);
  } else {
    const existing = await archive.findWork(payload.title);
    if (existing) {
      warnings.push(
        `A work titled "${existing.title}" already exists in the archive. Approving will update that node rather than create a second one.`
      );
    }
    plan.work = { title: payload.title, author: payload.author, exists: Boolean(existing) };

    const props = { title: payload.title, author: payload.author, keywords: resolved };
    ["year", "genre", "engInfo", "urduInfo"].forEach((k) => {
      if (payload[k]) props[k] = payload[k];
    });
    if (writeUrdu) props.keywordsUrdu = payload.keywordsUrdu;

    statements.push([
      `MERGE (w:Work {title: $title})
SET w += $props, w.contributedBy = $by, w.approvedAt = datetime()
MERGE (a:Author {name: $author})
MERGE (a)-[:WROTE]->(w)
RETURN w.title AS title`,
      { title: payload.title, props, author: payload.author, by: row.email || String(row.user_id) }
    ]);

    const link = (label, rel, value) =>
      statements.push([
        `MATCH (w:Work {title: $title})\nMERGE (n:${label} {name: $name})\nMERGE (w)-[:${rel}]->(n)`,
        { title: payload.title, name: value }
      ]);
    if (payload.genre) link("Genre", "HAS_GENRE", payload.genre);
    if (payload.language) link("Language", "USES_LANGUAGE", payload.language);
    if (payload.magazine) link("Magazine", "PUBLISHED_IN", payload.magazine);
  }

  return { plan, statements, payload };
}

router.get("/submissions/:id/preview", requireRole("moderator"), async (req, res) => {
  db.get(
    `SELECT s.*, u.email FROM submissions s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [req.params.id],
    async (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!row) return res.status(404).json({ error: "Submission not found" });
      try {
        const { plan, statements } = await buildPlan(row);
        res.json({
          submission: rowToSubmission(row),
          plan,
          statements: statements.map(([cypher, params]) => ({ cypher, params }))
        });
      } catch (e) {
        res.status(e.status || 502).json({ error: e.message });
      }
    }
  );
});

// ------------------------------------------------------------------ deciding

router.post("/submissions/:id/decide", requireRole("moderator"), (req, res) => {
  const decision = String(req.body.decision || "").trim();
  if (!["approve", "reject", "request_changes"].includes(decision)) {
    return res.status(400).json({ error: "decision must be approve, reject or request_changes" });
  }
  const note = String(req.body.note ?? "").trim().slice(0, 2000) || null;

  db.get(
    `SELECT s.*, u.email FROM submissions s LEFT JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [req.params.id],
    async (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!row) return res.status(404).json({ error: "Submission not found" });
      if (row.status !== "pending") {
        return res.status(409).json({ error: `Already ${row.status}` });
      }

      const finish = (status, appliedCypher) => {
        db.run(
          `UPDATE submissions SET status = ?, moderator_id = ?, moderator_note = ?,
             applied_cypher = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [status, req.account.id, note, appliedCypher || null, row.id],
          (uErr) => {
            if (uErr) return res.status(500).json({ error: "Failed to record decision" });
            res.json({ id: row.id, status, note });
          }
        );
      };

      if (decision !== "approve") {
        return finish(decision === "reject" ? "rejected" : "changes_requested");
      }

      try {
        const { plan, statements } = await buildPlan(row, req.body.keywordOverrides);
        if (plan.blocked) {
          return res.status(409).json({ error: plan.warnings.join(" "), plan });
        }
        const counters = await archive.writeArchive(statements);
        finish(
          "approved",
          statements.map(([c]) => c).join(";\n\n")
        );
        return void counters;
      } catch (e) {
        return res.status(e.status || 502).json({ error: "Could not write to the archive: " + e.message });
      }
    }
  );
});

// ------------------------------------------------------- archive helpers + users

router.get("/archive/vocabulary", authMiddleware, loadRole, async (req, res) => {
  try {
    res.json(await archive.vocabulary());
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
});

router.get("/archive/works", authMiddleware, loadRole, async (req, res) => {
  try {
    const rows = await archive.readArchive(
      `MATCH (w:Work) RETURN w.title AS title, w.author AS author,
              size(coalesce(w.keywords, [])) AS keywords ORDER BY toLower(w.title)`
    );
    res.json(rows);
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
});

router.get("/users", requireRole("moderator"), (req, res) => {
  db.all(`SELECT id, email, role FROM users ORDER BY id`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(rows);
  });
});

router.post("/users/:id/role", requireRole("moderator"), (req, res) => {
  const role = String(req.body.role || "").trim();
  if (!["reader", "contributor", "moderator"].includes(role)) {
    return res.status(400).json({ error: "role must be reader, contributor or moderator" });
  }
  if (Number(req.params.id) === req.account.id && role !== "moderator") {
    return res.status(400).json({ error: "You cannot remove your own moderator role" });
  }
  db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!this.changes) return res.status(404).json({ error: "User not found" });
    res.json({ id: Number(req.params.id), role });
  });
});

router.use((err, req, res, next) => {
  if (!err) return next();
  dropFile(req.file);
  const tooBig = err.code === "LIMIT_FILE_SIZE";
  res.status(400).json({
    error: tooBig ? `File is too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` : err.message
  });
});

module.exports = router;
module.exports.buildPlan = buildPlan;
