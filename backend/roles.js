const STORED_ROLES = ["contributor", "moderator", "admin"];
const RANKS = { contributor: 0, moderator: 1, admin: 2, sysadmin: 3 };

const rank = (role) => (Object.hasOwn(RANKS, role) ? RANKS[role] : 0);

const atLeast = (role, min) => rank(role) >= rank(min);

const normEmail = (email) => String(email || "").trim().toLowerCase();

function effectiveRole({ email, role }, sysadminEmails) {
  if (sysadminEmails.includes(normEmail(email))) return "sysadmin";
  return STORED_ROLES.includes(role) ? role : "contributor";
}

const canManage = (actorRole, targetRole) => rank(actorRole) > rank(targetRole);

const canAssign = (actorRole, newRole) => STORED_ROLES.includes(newRole) && rank(actorRole) > rank(newRole);

module.exports = { STORED_ROLES, RANKS, rank, atLeast, normEmail, effectiveRole, canManage, canAssign };
