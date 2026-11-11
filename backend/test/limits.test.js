const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, api, join } = require("./helpers");

test("editing is rate limited per person", async (t) => {
  const { base, stop } = await startServer({ limits: true });
  t.after(stop);
  const ann = await join(base, { email: "ann@test.dev", displayName: "Ann" });
  const note = { type: "note", targetKind: "work", target: "First Work", body: "v0" };
  const made = await api(base, "/api/submissions", { token: ann, body: note });
  const statuses = [];
  for (let i = 1; i <= 61; i += 1) {
    const res = await api(base, `/api/submissions/${made.body.id}`, { token: ann, method: "PATCH", body: { body: `v${i}` } });
    statuses.push(res.status);
  }
  assert.deepEqual([statuses[59], statuses[60]], [200, 429]);
});
