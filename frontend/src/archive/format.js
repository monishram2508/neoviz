const SQLITE_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export const parseDate = (value) => {
  if (!value) return null;
  const text = String(value);
  const date = new Date(SQLITE_TIMESTAMP.test(text) ? `${text.replace(" ", "T")}Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const longDate = (value) => {
  const date = parseDate(value);
  return date ? date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const RELATIVE_DAYS = 30;

const unitsAgo = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

export function ago(value, now = Date.now()) {
  const date = parseDate(value);
  if (!date) return "";
  const diff = Math.max(0, now - date.getTime());
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return unitsAgo(Math.floor(diff / MINUTE), "minute");
  if (diff < DAY) return unitsAgo(Math.floor(diff / HOUR), "hour");
  if (diff < RELATIVE_DAYS * DAY) return unitsAgo(Math.floor(diff / DAY), "day");
  return longDate(value);
}

export const dateTime = (value) => {
  const date = parseDate(value);
  return date ?
  date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) :
  "";
};

const pad = (n) => String(n).padStart(2, "0");

export const logTime = (value) => {
  const d = parseDate(value);
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
};

export const TYPE_LABELS = {
  note: "Note",
  citation: "Source",
  correction: "Correction",
  add_keywords: "Keywords",
  new_work: "New work"
};

const TYPE_WORDS = {
  note: "a note",
  citation: "a source",
  correction: "a correction",
  add_keywords: "keywords",
  new_work: "a new work"
};

const SUBMISSION_VERBS = {
  "submission.created": "submitted",
  "submission.edited": "edited",
  "submission.withdrawn": "withdrew",
  "submission.approved": "approved",
  "submission.rejected": "rejected",
  "submission.changes_requested": "requested changes to",
  "submission.retracted": "retracted"
};

const USER_PHRASES = {
  "user.registered": "created an account",
  "user.profile_changed": "updated their profile",
  "user.disabled": "disabled an account",
  "user.enabled": "enabled an account",
  "archive.reloaded": "reloaded archive data"
};

const capitalise = (text) => text ? text.charAt(0).toUpperCase() + text.slice(1) : "";

export function describeEvent(event) {
  const details = event.details || {};
  if (SUBMISSION_VERBS[event.action]) {
    return `${SUBMISSION_VERBS[event.action]} ${TYPE_WORDS[event.submissionType] || "a contribution"}`;
  }
  if (event.action === "user.role_changed") return `changed role to ${capitalise(details.to)}`;
  if (event.action === "user.deleted") {
    return details.displayName ? `deleted ${details.displayName}'s account` : "deleted an account";
  }
  return USER_PHRASES[event.action] || event.action;
}

export const actorLabel = (event) => (event.actorId == null ? "System" : event.actorName || "Deleted user");
