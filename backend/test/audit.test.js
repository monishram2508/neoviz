const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("./helpers");

test("activity log", async (t) => {
  const { stop } = await startServer();
  t.after(stop);
  const { all } = require("../sql");
  const { logEvent, eventsForSubmission, recentEvents } = require("../audit");

  const cols = (await all("PRAGMA table_info(users)")).map((c) => c.name);
  assert.ok(["display_name", "show_email", "disabled_at"].every((c) => cols.includes(c)));

  await assert.rejects(logEvent({ action: "submission.deleted" }), /Unknown audit action/);
  await logEvent({ action: "submission.created", submissionId: 7, details: { a: 1 } });
  await logEvent({ action: "submission.rejected", submissionId: 7, reason: "off-topic" });
  const rows = await eventsForSubmission(7);
  assert.deepEqual(rows.map((r) => r.action), ["submission.created", "submission.rejected"]);
  assert.deepEqual(rows[0].details, { a: 1 });
  assert.equal((await recentEvents({ limit: 1 }))[0].action, "submission.rejected");
});
