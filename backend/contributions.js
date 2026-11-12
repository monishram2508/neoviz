const TYPES = ["new_work", "add_keywords", "note", "citation", "correction"];

const STATUSES = ["pending", "changes_requested", "approved", "rejected", "withdrawn", "retracted"];

const TARGET_KINDS = {
  note: ["work", "author"],
  citation: ["work", "author"],
  correction: ["work", "author"],
  add_keywords: ["work"],
  new_work: []
};

const CORRECTABLE = {
  work: { year: 20, engInfo: 8000, urduInfo: 8000 },
  author: { bio: 8000 }
};

const FIELD_LABELS = {
  year: "year",
  engInfo: "English description",
  urduInfo: "Urdu description",
  bio: "biography"
};

const SQLITE_ONLY = ["note", "citation"];

const PENDING_MAX = 20;

const MESSAGES = {
  duplicate:
  "This title matches more than one record in the archive. The archive team needs to resolve the duplicate first.",
  offline: "The archive database is temporarily unavailable. Please try again later.",
  reasonMissing: "A reason is required to reject or request changes.",
  selfReview: "You cannot review your own contribution.",
  noDisplayName: "Add a display name in your profile settings before contributing.",
  pendingCap: `You have ${PENDING_MAX} contributions awaiting review. Please wait until some have been reviewed before submitting more.`,
  changed: "This contribution changed while you were reviewing it. Check the latest version before deciding.",
  busy: "Another reviewer is currently acting on this contribution. Please try again in a moment.",
  noVersion: "The version you reviewed could not be found. Reload the contribution and try again."
};

const NOTE_MAX = 4000;
const SOURCE_MAX = 1000;
const URL_MAX = 500;
const COMMENT_MAX = 2000;
const REASON_MAX = 2000;

const TRANSITIONS = {
  pending: {
    approve: "approved",
    reject: "rejected",
    request_changes: "changes_requested",
    edit: "pending",
    withdraw: "withdrawn"
  },
  changes_requested: { edit: "pending", withdraw: "withdrawn" },
  approved: { retract: "retracted" }
};

const text = (v) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

const tooLong = (value, max, label) => (value.length > max ? [`The ${label} must be ${max} characters or fewer`] : []);

const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== ""));

function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function validateNote(input) {
  const body = text(input.body);
  const bodyUrdu = text(input.bodyUrdu);
  const errors = [
  ...(body || bodyUrdu ? [] : ["Write the note in English, Urdu, or both"]),
  ...tooLong(body, NOTE_MAX, "English note"),
  ...tooLong(bodyUrdu, NOTE_MAX, "Urdu note")];

  return { errors, payload: compact({ body, bodyUrdu }) };
}

function validateCitation(input) {
  const source = text(input.source);
  const url = text(input.url);
  const comment = text(input.comment);
  const errors = [
  ...(source ? [] : ["A source is required"]),
  ...tooLong(source, SOURCE_MAX, "source"),
  ...(url && !isHttpUrl(url) ? ["The link must start with http:// or https://"] : []),
  ...tooLong(url, URL_MAX, "link"),
  ...tooLong(comment, COMMENT_MAX, "comment")];

  return { errors, payload: { source, ...compact({ url, comment }) } };
}

function validateCorrection(input, targetKind) {
  const field = text(input.field);
  const value = text(input.value);
  const reason = text(input.reason);
  const limits = CORRECTABLE[targetKind] || {};
  const allowed = Object.hasOwn(limits, field);
  const errors = [
  ...(allowed ? [] : ["Choose a field that can be corrected"]),
  ...(value ? [] : ["A new value is required"]),
  ...(allowed ? tooLong(value, limits[field], FIELD_LABELS[field]) : []),
  ...(reason ? [] : ["A reason is required"]),
  ...tooLong(reason, REASON_MAX, "reason")];

  return { errors, payload: { field, value, reason } };
}

const keyOf = (s) => String(s ?? "").trim().toLowerCase();

function resolveTarget(data, kind, key) {
  const list = kind === "work" ? data.works : kind === "author" ? data.authors : [];
  const field = kind === "work" ? "title" : "name";
  const wanted = keyOf(key);
  const hits = wanted ? list.filter((node) => keyOf(node[field]) === wanted) : [];
  if (!hits.length) return { status: "missing" };
  if (hits.length > 1) return { status: "duplicate", count: hits.length };
  return { status: "ok", node: hits[0] };
}

function nextStatus(from, action) {
  if (!Object.hasOwn(TRANSITIONS, from)) return null;
  return Object.hasOwn(TRANSITIONS[from], action) ? TRANSITIONS[from][action] : null;
}

module.exports = {
  TYPES,
  STATUSES,
  TARGET_KINDS,
  CORRECTABLE,
  FIELD_LABELS,
  SQLITE_ONLY,
  PENDING_MAX,
  MESSAGES,
  keyOf,
  validateNote,
  validateCitation,
  validateCorrection,
  resolveTarget,
  nextStatus
};
