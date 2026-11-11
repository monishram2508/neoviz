const { run, all } = require("./sql");

const ACTIONS = Object.freeze([
  "submission.created",
  "submission.edited",
  "submission.withdrawn",
  "submission.approved",
  "submission.rejected",
  "submission.changes_requested",
  "submission.retracted",
  "user.registered",
  "user.profile_changed",
  "user.role_changed",
  "user.disabled",
  "user.enabled",
  "user.deleted",
  "archive.reloaded"
]);

const PAGE_DEFAULT = 50;
const PAGE_MAX = 200;
const USER_LOG_MAX = 500;

const SELECT = `
  SELECT l.id, l.at, l.actor_id AS actorId,
    CASE WHEN u.id IS NULL THEN NULL ELSE COALESCE(u.display_name, 'User ' || u.id) END AS actorName,
    l.action, l.submission_id AS submissionId, s.type AS submissionType, s.target AS submissionTarget,
    l.subject_user_id AS subjectUserId,
    CASE WHEN su.id IS NULL THEN NULL ELSE COALESCE(su.display_name, 'User ' || su.id) END AS subjectName,
    l.reason, l.details
  FROM audit_log l
  LEFT JOIN users u ON u.id = l.actor_id
  LEFT JOIN submissions s ON s.id = l.submission_id
  LEFT JOIN users su ON su.id = l.subject_user_id`;

const shape = (row) => ({ ...row, details: row.details ? JSON.parse(row.details) : null });

async function logEvent({ actorId = null, action, submissionId = null, subjectUserId = null, reason = null, details = null }) {
  if (!ACTIONS.includes(action)) throw new Error(`Unknown audit action: ${action}`);
  const { lastID } = await run(
    `INSERT INTO audit_log (actor_id, action, submission_id, subject_user_id, reason, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [actorId, action, submissionId, subjectUserId, reason, details === null ? null : JSON.stringify(details)]
  );
  return lastID;
}

async function eventsForSubmission(id) {
  const rows = await all(`${SELECT} WHERE l.submission_id = ? ORDER BY l.id`, [id]);
  return rows.map(shape);
}

async function eventsForUser(userId) {
  const rows = await all(
    `${SELECT}
     WHERE l.actor_id = ? OR l.subject_user_id = ?
        OR l.submission_id IN (SELECT id FROM submissions WHERE user_id = ?)
     ORDER BY l.id DESC LIMIT ?`,
    [userId, userId, userId, USER_LOG_MAX]
  );
  return rows.map(shape);
}

async function recentEvents({ before = null, limit = PAGE_DEFAULT } = {}) {
  const size = Math.min(Math.max(Number(limit) || PAGE_DEFAULT, 1), PAGE_MAX);
  const cursor = Number(before);
  const rows = cursor ?
  await all(`${SELECT} WHERE l.id < ? ORDER BY l.id DESC LIMIT ?`, [cursor, size]) :
  await all(`${SELECT} ORDER BY l.id DESC LIMIT ?`, [size]);
  return rows.map(shape);
}

module.exports = { ACTIONS, logEvent, eventsForSubmission, eventsForUser, recentEvents };
