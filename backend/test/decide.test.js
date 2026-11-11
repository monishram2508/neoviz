const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, api, join } = require("./helpers");

test("moderation decisions", async (t) => {
  const { base, stop } = await startServer({ moderators: "mod@test.dev,mod2@test.dev", admins: "boss@test.dev" });
  t.after(stop);
  const ann = await join(base, { email: "ann@test.dev", displayName: "Ann" });
  const mod = await join(base, { email: "mod@test.dev", displayName: "Mo" });
  const mod2 = await join(base, { email: "mod2@test.dev", displayName: "Mo2" });
  const boss = await join(base, { email: "boss@test.dev", displayName: "Boss" });
  const submit = (token, body) => api(base, "/api/submissions", { token, body }).then((r) => r.body);
  const decide = (token, item, body) =>
  api(base, `/api/submissions/${item.id}/decide`, { token, body: { version: item.version, ...body } });

  const n1 = await submit(ann, { type: "note", targetKind: "work", target: "First Work", body: "A" });
  assert.equal((await decide(mod, n1, { decision: "reject" })).status, 400);
  assert.equal((await decide(ann, n1, { decision: "approve" })).status, 403);
  assert.equal((await decide(mod, n1, { decision: "approve" })).status, 200);
  assert.equal((await decide(mod2, n1, { decision: "approve" })).status, 409);

  const own = await submit(mod, { type: "note", targetKind: "work", target: "First Work", body: "B" });
  assert.equal((await decide(mod, own, { decision: "approve" })).body.error, "You can't review your own contribution.");

  const fix = await submit(ann, { type: "correction", targetKind: "work", target: "First Work", field: "year", value: "1951", reason: "Library record" });
  const preview = await api(base, `/api/submissions/${fix.id}/preview`, { token: mod });
  assert.deepEqual([preview.body.plan.correction.before, preview.body.plan.correction.after], ["1950", "1951"]);
  const offline = await decide(mod, fix, { decision: "approve" });
  assert.deepEqual([offline.status, offline.body.error], [503, "The archive database is offline — try again later."]);
  assert.equal((await api(base, `/api/submissions/${fix.id}`, { token: ann })).body.status, "pending");

  const retract = (token, body) => api(base, `/api/submissions/${n1.id}/retract`, { token, body });
  assert.equal((await retract(mod, { reason: "x" })).status, 403);
  assert.equal((await retract(boss, {})).status, 400);
  assert.equal((await retract(boss, { reason: "Spam" })).status, 200);

  const history = await api(base, `/api/submissions/${n1.id}/history`, { token: ann });
  assert.equal(history.body.filter((e) => e.action === "submission.approved").length, 1);
  assert.equal(history.body.find((e) => e.action === "submission.approved").actorName, undefined);
});
