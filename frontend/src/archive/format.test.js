import { parseDate, longDate, describeEvent, actorLabel, ago } from "./format";

test("ages read like 3 days ago", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  expect(ago("2026-11-08 12:00:00", now)).toBe("3 days ago");
  expect(ago("2026-11-11 11:59:30", now)).toBe("just now");
  expect(ago("2026-11-11 11:00:00", now)).toBe("1 hour ago");
});

test("activity entries read as plain words", () => {
  expect(describeEvent({ action: "user.role_changed", details: { from: "contributor", to: "moderator" } })).toBe("changed role to Moderator");
  expect(describeEvent({ action: "submission.approved", submissionType: "note" })).toBe("approved a note");
  expect(describeEvent({ action: "submission.rejected" })).toBe("rejected a contribution");
  expect(describeEvent({ action: "submission.created", submissionType: "add_keywords" })).toBe("submitted keywords");
  expect(actorLabel({ actorId: null })).toBe("System");
  expect(actorLabel({ actorId: 4, actorName: null })).toBe("Deleted user");
});

test("SQLite timestamps are read as UTC", () => {
  expect(parseDate("2026-11-11 06:40:25").toISOString()).toBe("2026-11-11T06:40:25.000Z");
  expect(parseDate("nonsense")).toBe(null);
  expect(parseDate(null)).toBe(null);
});

test("long dates read like 14 September 2026", () => {
  expect(longDate("2026-09-14T12:00:00.000Z")).toBe("14 September 2026");
  expect(longDate(undefined)).toBe("");
});
