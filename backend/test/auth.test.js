const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, api, join } = require("./helpers");

test("accounts", async (t) => {
  const { base, stop } = await startServer({ sysadmins: "Root@Test.dev" });
  t.after(stop);

  assert.equal((await api(base, "/api/register", { body: { email: "a@b.c", password: "short", displayName: "Ann" } })).status, 400);
  assert.equal((await api(base, "/api/register", { body: { email: "a@b.c", password: "password123", displayName: "A" } })).status, 400);

  const token = await join(base, { email: "Ann@Test.dev", displayName: "Ann" });
  const me = await api(base, "/api/me", { token });
  assert.deepEqual({ ...me.body, id: undefined }, { id: undefined, email: "ann@test.dev", displayName: "Ann", showEmail: false, role: "contributor" });

  const bad = await api(base, "/api/login", { body: { email: "nobody@test.dev", password: "password123" } });
  assert.deepEqual([bad.status, bad.body.error], [400, "Incorrect email or password."]);
  assert.equal((await api(base, "/api/login", { body: { email: "ANN@test.dev", password: "password123" } })).status, 200);

  assert.equal((await api(base, "/api/query", { token, body: { cypher: "RETURN 1" } })).status, 403);

  const root = await join(base, { email: "ROOT@test.dev", displayName: "Root" });
  assert.equal((await api(base, "/api/me", { token: root })).body.role, "sysadmin");

  const patched = await api(base, "/api/me", { token, method: "PATCH", body: { displayName: "Ann K", showEmail: true } });
  assert.deepEqual([patched.body.displayName, patched.body.showEmail], ["Ann K", true]);
});
