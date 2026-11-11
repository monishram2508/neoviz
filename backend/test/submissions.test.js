const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, api, join } = require("./helpers");

test("submission lifecycle for contributors", async (t) => {
  const { base, stop } = await startServer({ moderators: "mod@test.dev" });
  t.after(stop);
  const ann = await join(base, { email: "ann@test.dev", displayName: "Ann" });
  const note = { type: "note", targetKind: "work", target: "first work", body: "Context" };

  const made = await api(base, "/api/submissions", { token: ann, body: note });
  assert.equal(made.status, 201);
  assert.equal((await api(base, `/api/submissions/${made.body.id}`, { token: ann })).body.target, "First Work");

  const dup = await api(base, "/api/submissions", { token: ann, body: { ...note, target: "Same Title" } });
  assert.deepEqual([dup.status, dup.body.error], [409, "This title matches more than one record in the archive. The archive team needs to resolve the duplicate first."]);
  assert.equal((await api(base, "/api/submissions", { token: ann, body: { ...note, target: "Nope" } })).status, 400);

  const fix = await api(base, "/api/submissions", { token: ann, body: { type: "correction", targetKind: "author", target: "Test Author", field: "bio", value: "New bio", reason: "Book" } });
  assert.equal((await api(base, `/api/submissions/${fix.body.id}`, { token: ann })).body.payload.before, "Old bio");

  const edited = await api(base, `/api/submissions/${made.body.id}`, { token: ann, method: "PATCH", body: { body: "Better context" } });
  assert.equal(edited.status, 200);
  assert.equal((await api(base, `/api/submissions/${made.body.id}/withdraw`, { token: ann, method: "POST" })).status, 200);
  assert.equal((await api(base, `/api/submissions/${made.body.id}/withdraw`, { token: ann, method: "POST" })).status, 409);

  const history = await api(base, `/api/submissions/${made.body.id}/history`, { token: ann });
  assert.deepEqual(history.body.map((e) => e.action), ["submission.created", "submission.edited", "submission.withdrawn"]);

  const mod = await join(base, { email: "mod@test.dev", displayName: "Mo" });
  const queue = await api(base, "/api/submissions?status=pending", { token: mod });
  assert.equal(queue.body[0].submittedBy.displayName, "Ann");
  assert.equal(JSON.stringify(queue.body).includes("ann@test.dev"), false);
});

test("pending cap", async (t) => {
  const { base, stop } = await startServer();
  t.after(stop);
  const bob = await join(base, { email: "bob@test.dev", displayName: "Bob" });
  const note = { type: "note", targetKind: "author", target: "Test Author", body: "n" };
  for (let i = 0; i < 20; i += 1) await api(base, "/api/submissions", { token: bob, body: note });
  assert.equal((await api(base, "/api/submissions", { token: bob, body: note })).status, 409);
});
