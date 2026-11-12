import { NO_FILTERS, actionGroup, filterEvents, sortEvents } from "./auditView";

const EVENTS = [
{ id: 1, at: "2026-11-10 09:00:00", action: "user.registered", actorId: 1, actorName: "Zara" },
{ id: 2, at: "2026-11-11 10:00:00", action: "submission.created", actorId: 2, actorName: "Ann", submissionId: 7, submissionType: "note", submissionTarget: "Aadapilla" },
{ id: 3, at: "2026-11-11 11:00:00", action: "submission.rejected", actorId: 1, actorName: "Zara", submissionId: 7, submissionType: "note", submissionTarget: "Aadapilla", reason: "Duplicate" }];


test("actions fall into contribution, review, account and system groups", () => {
  expect(["submission.edited", "submission.approved", "user.disabled", "archive.reloaded"].map(actionGroup)).
  toEqual(["submission", "review", "user", "archive"]);
});

test("filters combine user, action group, search text and dates", () => {
  const ids = (filters) => filterEvents(EVENTS, { ...NO_FILTERS, ...filters }).map((e) => e.id);
  expect(ids({})).toEqual([1, 2, 3]);
  expect(ids({ user: "Zara" })).toEqual([1, 3]);
  expect(ids({ action: "review" })).toEqual([3]);
  expect(ids({ text: "duplicate" })).toEqual([3]);
  expect(ids({ from: "2026-11-11" })).toEqual([2, 3]);
  expect(ids({ to: "2026-11-10" })).toEqual([1]);
});

test("sorting by any column keeps newest first among ties", () => {
  expect(sortEvents(EVENTS, { key: "time", dir: "desc" }).map((e) => e.id)).toEqual([3, 2, 1]);
  expect(sortEvents(EVENTS, { key: "user", dir: "asc" }).map((e) => e.id)).toEqual([2, 3, 1]);
  expect(sortEvents(EVENTS, { key: "item", dir: "desc" }).map((e) => e.id)).toEqual([3, 2, 1]);
});
