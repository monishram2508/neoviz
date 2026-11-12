const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { run, get, all } = require("./sql");
const { authMiddleware, loadRole, requireRole, asyncRoute } = require("./middleware");
const { cleanSurface, normKey, cleanPair, canonicalise, mergeKeywords } = require("./normalize");
const archive = require("./archive");
const { load } = require("./archiveCache");
const { atLeast } = require("./roles");
const { submitLimiter, editLimiter } = require("./limits");
const { logEvent, eventsForSubmission } = require("./audit");
const {
  TYPES,
  STATUSES,
  TARGET_KINDS,
  CORRECTABLE,
  SQLITE_ONLY,
  MESSAGES,
  PENDING_MAX,
  validateNote,
  validateCitation,
  validateCorrection,
  resolveTarget,
  nextStatus
} = require("./contributions");

const router = express.Router();

const { config } = require("./config");

const UPLOAD_DIR = config.uploadDir;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = new Set([".txt", ".md", ".pdf", ".doc", ".docx", ".rtf", ".odt"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_KEYWORDS = 400;
const DECISION_EVENTS = [
"submission.approved",
"submission.rejected",
"submission.changes_requested",
"submission.retracted"];

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
      const message = `Unsupported file type "${ext}". Allowed: ${[...ALLOWED_EXT].join(", ")}`;
      return cb(Object.assign(new Error(message), { status: 400 }));
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

function validate(type, body, targetKind) {
  if (type === "note") return validateNote(body);
  if (type === "citation") return validateCitation(body);
  if (type === "correction") return validateCorrection(body, targetKind);

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

const SELECT_SUBMISSION = `
  SELECT s.*,
    CASE WHEN u.id IS NULL THEN NULL ELSE COALESCE(u.display_name, 'User ' || u.id) END AS display_name
  FROM submissions s LEFT JOIN users u ON u.id = s.user_id`;

const rowToSubmission = (row) => ({
  id: row.id,
  type: row.type,
  targetKind: row.target_kind || null,
  target: row.target,
  status: row.status,
  payload: JSON.parse(row.payload),
  version: versionOf(row.payload),
  file: row.file_name ? { name: row.file_name, size: row.file_size } : null,
  submittedBy: { id: row.user_id, displayName: row.display_name || null },
  moderatorNote: row.moderator_note,
  createdAt: row.created_at,
  updatedAt: row.updated_at || null,
  decidedAt: row.decided_at
});

const findSubmission = (id) => get(`${SELECT_SUBMISSION} WHERE s.id = ?`, [id]);

const alreadyMessage = (status) => `Already ${status.replace("_", " ")}`;

const byOf = (row) => `user:${row.user_id}`;

const VERSION_LENGTH = 16;

const versionOf = (payloadText) =>
crypto.createHash("sha256").update(String(payloadText)).digest("hex").slice(0, VERSION_LENGTH);

const inFlight = new Set();

const exclusive = (handler) =>
asyncRoute(async (req, res, next) => {
  const id = Number(req.params.id);
  if (inFlight.has(id)) return res.status(409).json({ error: MESSAGES.busy });
  inFlight.add(id);
  try {
    return await handler(req, res, next);
  } finally {
    inFlight.delete(id);
  }
});

function locate(data, kind, key) {
  const found = resolveTarget(data, kind, key);
  if (found.status === "missing") return { status: 400, error: `This ${kind} could not be found in the archive.` };
  if (found.status === "duplicate") return { status: 409, error: MESSAGES.duplicate };
  return { node: found.node };
}

function targetKindFor(type, requested) {
  const kinds = TARGET_KINDS[type];
  if (!kinds.length) return { kind: null };
  const kind = String(requested || (kinds.length === 1 ? kinds[0] : "")).trim();
  return kinds.includes(kind) ? { kind } : { error: `targetKind must be ${kinds.join(" or ")}` };
}

async function preparePayload(type, targetKind, body) {
  const { errors, payload } = validate(type, body, targetKind);
  if (errors.length) return { status: 400, error: errors.join("; "), errors };
  if (!targetKind) return { payload, target: payload.title };

  const data = await load().catch(() => null);
  if (!data) return { status: 503, error: MESSAGES.offline };
  const found = locate(data, targetKind, body.target ?? body.workTitle);
  if (found.error) return found;

  const target = targetKind === "work" ? found.node.title : found.node.name;
  const extra =
  type === "correction" ? { before: found.node[payload.field] ?? null } :
  type === "add_keywords" ? { workTitle: target } :
  {};
  return { payload: { ...payload, ...extra }, target };
}

router.post(
  "/submissions",
  authMiddleware,
  loadRole,
  submitLimiter,
  upload.single("file"),
  asyncRoute(async (req, res) => {
    const refuse = (status, error, extra = {}) => {
      dropFile(req.file);
      return res.status(status).json({ error, ...extra });
    };
    if (!req.account.displayName) return refuse(400, MESSAGES.noDisplayName);

    const type = String(req.body.type || "").trim();
    if (!TYPES.includes(type)) return refuse(400, `type must be one of: ${TYPES.join(", ")}`);

    const { kind, error: kindError } = targetKindFor(type, req.body.targetKind);
    if (kindError) return refuse(400, kindError);

    const prepared = await preparePayload(type, kind, req.body);
    if (prepared.error) {
      return refuse(prepared.status, prepared.error, prepared.errors ? { errors: prepared.errors } : {});
    }

    const { waiting } = await get(
      `SELECT count(*) AS waiting FROM submissions
       WHERE user_id = ? AND status IN ('pending', 'changes_requested')`,
      [req.account.id]
    );
    if (waiting >= PENDING_MAX) return refuse(409, MESSAGES.pendingCap);

    const { lastID } = await run(
      `INSERT INTO submissions (user_id, type, target_kind, target, payload, file_name, file_path, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
      req.account.id,
      type,
      kind,
      prepared.target,
      JSON.stringify(prepared.payload),
      req.file ? req.file.originalname : null,
      req.file ? req.file.filename : null,
      req.file ? req.file.size : null]

    );
    await logEvent({ actorId: req.account.id, action: "submission.created", submissionId: lastID });
    res.status(201).json({
      id: lastID,
      status: "pending",
      type,
      targetKind: kind,
      target: prepared.target,
      payload: prepared.payload,
      version: versionOf(JSON.stringify(prepared.payload))
    });
  })
);

router.get("/submissions/mine", authMiddleware, loadRole, asyncRoute(async (req, res) => {
  const rows = await all(`${SELECT_SUBMISSION} WHERE s.user_id = ? ORDER BY s.created_at DESC, s.id DESC`, [
  req.account.id]
  );
  res.json(rows.map(rowToSubmission));
}));

router.get("/submissions", requireRole("moderator"), asyncRoute(async (req, res) => {
  const statuses = String(req.query.status || "").split(",").map((s) => s.trim()).filter(Boolean);
  const type = String(req.query.type || "").trim();
  if (statuses.some((s) => !STATUSES.includes(s))) {
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(", ")}` });
  }
  if (type && !TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${TYPES.join(", ")}` });
  }
  const clauses = [
  ...(statuses.length ? [`s.status IN (${statuses.map(() => "?").join(", ")})`] : []),
  ...(type ? ["s.type = ?"] : [])];

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await all(`${SELECT_SUBMISSION} ${where} ORDER BY s.created_at, s.id`, [
  ...statuses,
  ...(type ? [type] : [])]
  );
  res.json(rows.map(rowToSubmission));
}));

const loadSubmission = asyncRoute(async (req, res, next) => {
  const row = await findSubmission(req.params.id);
  if (!row) return res.status(404).json({ error: "Submission not found" });
  if (row.user_id !== req.account.id && !atLeast(req.account.role, "moderator")) {
    return res.status(403).json({ error: "Not your submission" });
  }
  req.submission = row;
  next();
});

const ownerOnly = (req, res, next) =>
req.submission.user_id === req.account.id ? next() : res.status(403).json({ error: "Not your submission" });

router.get("/submissions/:id", authMiddleware, loadRole, loadSubmission, (req, res) => {
  res.json(rowToSubmission(req.submission));
});

router.patch("/submissions/:id", authMiddleware, loadRole, editLimiter, loadSubmission, ownerOnly, exclusive(async (req, res) => {
  const row = req.submission;
  if (!nextStatus(row.status, "edit")) return res.status(409).json({ error: alreadyMessage(row.status) });

  const prepared = await preparePayload(row.type, row.target_kind, { ...req.body, target: row.target });
  if (prepared.error) {
    return res.status(prepared.status).json({ error: prepared.error, ...(prepared.errors ? { errors: prepared.errors } : {}) });
  }

  const { changes } = await run(
    `UPDATE submissions SET payload = ?, target = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = ?`,
    [JSON.stringify(prepared.payload), prepared.target, row.id, row.status]
  );
  if (!changes) return res.status(409).json({ error: "This contribution changed while you were editing it" });

  await logEvent({
    actorId: req.account.id,
    action: "submission.edited",
    submissionId: row.id,
    details: { previous: JSON.parse(row.payload) }
  });
  res.json(rowToSubmission(await findSubmission(row.id)));
}));

router.post("/submissions/:id/withdraw", authMiddleware, loadRole, editLimiter, loadSubmission, ownerOnly, exclusive(async (req, res) => {
  const row = req.submission;
  const status = nextStatus(row.status, "withdraw");
  if (!status) return res.status(409).json({ error: alreadyMessage(row.status) });

  const { changes } = await run(
    `UPDATE submissions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`,
    [status, row.id, row.status]
  );
  if (!changes) return res.status(409).json({ error: "This contribution changed while you were withdrawing it" });

  await logEvent({ actorId: req.account.id, action: "submission.withdrawn", submissionId: row.id });
  res.json({ id: row.id, status });
}));

router.get("/submissions/:id/history", authMiddleware, loadRole, loadSubmission, asyncRoute(async (req, res) => {
  const events = await eventsForSubmission(req.submission.id);
  if (atLeast(req.account.role, "moderator")) return res.json(events);
  res.json(
    events.map(({ actorId, actorName, ...rest }) =>
    DECISION_EVENTS.includes(rest.action) ? rest : { actorId, actorName, ...rest }
    )
  );
}));

router.get("/submissions/:id/file", authMiddleware, loadRole, loadSubmission, (req, res) => {
  const row = req.submission;
  if (!row.file_path) return res.status(404).json({ error: "No file attached" });
  const full = path.join(UPLOAD_DIR, path.basename(row.file_path));
  if (!fs.existsSync(full)) return res.status(404).json({ error: "File is missing from disk" });
  res.download(full, row.file_name);
});

async function keywordPlan(row, payload, overrides) {
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
    const params = { t: work.title.trim().toLowerCase(), keywords: after, by: byOf(row) };
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
      { title: payload.title, props, author: payload.author, by: byOf(row) }
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

const OFFLINE_CODES = ["ServiceUnavailable", "SessionExpired", "ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT"];

const isOffline = (err) => !config.archive.uri || OFFLINE_CODES.includes(err?.code);

const kindOf = (row) => row.target_kind || (row.type === "add_keywords" ? "work" : null);

const blockedPlan = (row, payload, message) => ({
  plan: { type: row.type, blocked: true, warnings: [message] },
  statements: [],
  payload
});

const GRAPH = {
  work: { label: "Work", key: "title", alias: "w" },
  author: { label: "Author", key: "name", alias: "a" }
};

function correctionPlan(row, payload, kind, node) {
  const { field, value } = payload;
  if (!Object.hasOwn(CORRECTABLE[kind], field)) return blockedPlan(row, payload, `"${field}" cannot be corrected.`);

  const before = payload.before ?? null;
  const current = node[field] ?? null;
  const changedSinceSubmit = current !== before;
  const { label, key, alias: n } = GRAPH[kind];
  const cypher =
  `MATCH (${n}:${label}) WHERE toLower(trim(${n}.${key})) = $t\n` +
  `SET ${n}.${field} = $value, ${n}.lastContributionBy = $by, ${n}.lastContributionAt = datetime()\n` +
  `RETURN ${n}.${key} AS ${key}`;

  return {
    plan: {
      type: row.type,
      correction: { kind, target: row.target, field, before, current, after: value, changedSinceSubmit },
      warnings: changedSinceSubmit ? ["The current value has changed since this was submitted."] : []
    },
    statements: [[cypher, { t: row.target.trim().toLowerCase(), value, by: byOf(row) }]],
    payload
  };
}

async function buildPlan(row, overrides = {}) {
  const payload = JSON.parse(row.payload);
  const kind = kindOf(row);
  const found = kind ? resolveTarget(await load(), kind, row.target) : null;
  if (found?.status === "duplicate") return blockedPlan(row, payload, MESSAGES.duplicate);
  if (found?.status === "missing") {
    return blockedPlan(row, payload, `No ${kind} called "${row.target}" exists in the archive any more.`);
  }
  if (SQLITE_ONLY.includes(row.type)) {
    return { plan: { type: row.type, sqliteOnly: true, warnings: [] }, statements: [], payload };
  }
  if (row.type === "correction") return correctionPlan(row, payload, kind, found.node);
  return keywordPlan(row, payload, overrides);
}

router.get("/submissions/:id/preview", requireRole("moderator"), asyncRoute(async (req, res) => {
  const row = await findSubmission(req.params.id);
  if (!row) return res.status(404).json({ error: "Submission not found" });
  try {
    const { plan, statements } = await buildPlan(row);
    res.json({
      submission: rowToSubmission(row),
      plan,
      statements: statements.map(([cypher, params]) => ({ cypher, params }))
    });
  } catch (err) {
    if (isOffline(err)) return res.status(503).json({ error: MESSAGES.offline });
    res.status(err.status || 502).json({ error: err.message });
  }
}));

const DECISIONS = ["approve", "reject", "request_changes"];
const NOTE_MAX = 2000;

const DECISION_ACTIONS = {
  approved: "submission.approved",
  rejected: "submission.rejected",
  changes_requested: "submission.changes_requested"
};

const archiveFailure = (err, prefix) =>
isOffline(err) ?
{ status: 503, body: { error: MESSAGES.offline } } :
{ status: 502, body: { error: `${prefix}: ${err.message}` } };

const correctionDetails = (plan) =>
plan.correction ?
{ field: plan.correction.field, overwritten: plan.correction.current, value: plan.correction.after } :
null;

async function applyApproval(row, overrides) {
  const built = await buildPlan(row, overrides).then((value) => ({ value }), (error) => ({ error }));
  if (built.error) return archiveFailure(built.error, "Could not read the archive");
  const { plan, statements } = built.value;
  if (plan.blocked) return { status: 409, body: { error: plan.warnings.join(" "), plan } };
  if (SQLITE_ONLY.includes(row.type)) return { applied: null, details: null };

  const failure = await archive.writeArchive(statements).then(() => null, (err) => err);
  if (failure) return archiveFailure(failure, "Could not write to the archive");
  return { applied: statements.map(([cypher]) => cypher).join(";\n\n"), details: correctionDetails(plan) };
}

router.post("/submissions/:id/decide", requireRole("moderator"), exclusive(async (req, res) => {
  const decision = String(req.body.decision || "").trim();
  if (!DECISIONS.includes(decision)) {
    return res.status(400).json({ error: "decision must be approve, reject or request_changes" });
  }
  const note = String(req.body.note ?? "").trim().slice(0, NOTE_MAX) || null;
  if (decision !== "approve" && !note) return res.status(400).json({ error: MESSAGES.reasonMissing });
  const version = String(req.body.version ?? "").trim();
  if (!version) return res.status(400).json({ error: MESSAGES.noVersion });

  const row = await findSubmission(req.params.id);
  if (!row) return res.status(404).json({ error: "Submission not found" });
  if (row.user_id === req.account.id && req.account.role === "moderator") {
    return res.status(403).json({ error: MESSAGES.selfReview });
  }
  const status = nextStatus(row.status, decision);
  if (!status) return res.status(409).json({ error: alreadyMessage(row.status) });
  if (versionOf(row.payload) !== version) return res.status(409).json({ error: MESSAGES.changed });

  const approval =
  decision === "approve" ? await applyApproval(row, req.body.keywordOverrides) : { applied: null, details: null };
  if (approval.status) return res.status(approval.status).json(approval.body);

  const { changes } = await run(
    `UPDATE submissions SET status = ?, moderator_id = ?, moderator_note = ?, applied_cypher = ?,
       decided_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'`,
    [status, req.account.id, note, approval.applied, row.id]
  );
  if (!changes) return res.status(409).json({ error: "Already decided" });

  if (approval.applied) {
    load({ force: true }).catch((err) => console.error("Archive reload after approval failed:", err.message));
  }
  await logEvent({
    actorId: req.account.id,
    action: DECISION_ACTIONS[status],
    submissionId: row.id,
    subjectUserId: row.user_id,
    reason: note,
    details: approval.details
  });
  res.json({ id: row.id, status, note });
}));

router.post("/submissions/:id/retract", requireRole("admin"), exclusive(async (req, res) => {
  const reason = String(req.body.reason ?? "").trim().slice(0, NOTE_MAX);
  if (!reason) return res.status(400).json({ error: "A reason is required." });

  const row = await findSubmission(req.params.id);
  if (!row) return res.status(404).json({ error: "Submission not found" });
  if (!SQLITE_ONLY.includes(row.type)) {
    return res.status(409).json({ error: "Only notes and citations can be retracted" });
  }
  const status = nextStatus(row.status, "retract");
  if (!status) return res.status(409).json({ error: "Only approved contributions can be retracted" });

  const { changes } = await run(
    `UPDATE submissions SET status = ?, moderator_id = ?, moderator_note = ?, decided_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'approved'`,
    [status, req.account.id, reason, row.id]
  );
  if (!changes) return res.status(409).json({ error: "Already retracted" });

  await logEvent({
    actorId: req.account.id,
    action: "submission.retracted",
    submissionId: row.id,
    subjectUserId: row.user_id,
    reason
  });
  res.json({ id: row.id, status });
}));

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

router.use((err, req, res, next) => {
  dropFile(req.file);
  if (!(err instanceof multer.MulterError)) return next(err);
  const tooBig = err.code === "LIMIT_FILE_SIZE";
  res.status(400).json({
    error: tooBig ? `File is too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` : err.message
  });
});

module.exports = router;
module.exports.buildPlan = buildPlan;
module.exports.rowToSubmission = rowToSubmission;
module.exports.SELECT_SUBMISSION = SELECT_SUBMISSION;
