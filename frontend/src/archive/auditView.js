import { TYPE_LABELS, actorLabel, describeEvent, parseDate } from "./format";
import { matches } from "./search";

const REVIEW_ACTIONS = new Set([
"submission.approved",
"submission.rejected",
"submission.changes_requested",
"submission.retracted"]
);

export const ACTION_FILTERS = [
["all", "All actions"],
["submission", "Contributions"],
["review", "Reviews"],
["user", "Accounts"],
["archive", "System"]];


export const NO_FILTERS = { text: "", user: "", action: "all", from: "", to: "" };

export const actionGroup = (action) => {
  if (action.startsWith("user.")) return "user";
  if (action.startsWith("archive.")) return "archive";
  return REVIEW_ACTIONS.has(action) ? "review" : "submission";
};

export function itemText(event) {
  if (event.submissionId) return event.submissionTarget || TYPE_LABELS[event.submissionType] || "Contribution";
  if (!event.subjectUserId || event.subjectUserId === event.actorId) return "";
  return event.subjectName || event.details?.displayName || "Deleted user";
}

export function filterEvents(events, filters) {
  const start = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
  const end = filters.to ? new Date(`${filters.to}T23:59:59.999`) : null;
  return events.filter((event) => {
    if (filters.user && actorLabel(event) !== filters.user) return false;
    if (filters.action !== "all" && actionGroup(event.action) !== filters.action) return false;
    const at = parseDate(event.at);
    if (start && at < start) return false;
    if (end && at > end) return false;
    return matches(filters.text, actorLabel(event), describeEvent(event), itemText(event), event.reason);
  });
}

const SORT_VALUES = {
  time: (event) => event.id,
  user: (event) => actorLabel(event).toLowerCase(),
  action: (event) => describeEvent(event),
  item: (event) => itemText(event).toLowerCase()
};

export function sortEvents(events, { key, dir }) {
  const value = SORT_VALUES[key];
  const sign = dir === "asc" ? 1 : -1;
  return [...events].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x < y) return -sign;
    if (x > y) return sign;
    return b.id - a.id;
  });
}
