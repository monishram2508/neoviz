const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, api, join } = require("./helpers");

test("people management", async (t) => {
  const { base, stop } = await startServer({ admins: "boss@test.dev", sysadmins: "root@test.dev" });
  t.after(stop);
  const ann = await join(base, { email: "ann@test.dev", displayName: "Ann" });
  const boss = await join(base, { email: "boss@test.dev", displayName: "Boss" });
  const root = await join(base, { email: "root@test.dev", displayName: "Root" });
  const id = async (token) => (await api(base, "/api/me", { token })).body.id;
  const [annId, bossId, rootId] = [await id(ann), await id(boss), await id(root)];
  const setRole = (token, uid, role) => api(base, `/api/users/${uid}/role`, { token, body: { role } });

  assert.equal((await setRole(boss, annId, "moderator")).status, 200);
  assert.equal((await setRole(boss, annId, "admin")).status, 403);
  assert.equal((await setRole(boss, rootId, "contributor")).status, 403);
  assert.equal((await setRole(root, bossId, "contributor")).status, 200);
  assert.equal((await setRole(root, annId, "sysadmin")).status, 403);

  const n = (await api(base, "/api/submissions", { token: root, body: { type: "note", targetKind: "work", target: "First Work", body: "x" } })).body.id;
  await setRole(root, annId, "contributor");
  assert.equal((await api(base, `/api/submissions/${n}/decide`, { token: ann, body: { decision: "approve" } })).status, 403);

  assert.equal((await api(base, `/api/users/${annId}/disable`, { token: root, method: "POST" })).status, 200);
  assert.equal((await api(base, "/api/me", { token: ann })).status, 403);
  assert.equal((await api(base, "/api/login", { body: { email: "ann@test.dev", password: "password123" } })).body.error, "This account has been disabled. Please contact an administrator.");

  assert.equal((await api(base, "/api/system", { token: boss })).status, 403);
  assert.equal((await api(base, "/api/system", { token: root })).body.archive.source, "snapshot");

  const log = await api(base, "/api/audit", { token: root });
  assert.ok(log.body.some((e) => e.action === "user.role_changed" && e.details.to === "moderator"));
  assert.ok(log.body.some((e) => e.action === "user.role_changed" && e.subjectName === "Ann"));
  assert.ok(log.body.some((e) => e.action === "submission.created" && e.submissionType === "note" && e.submissionTarget === "First Work"));
});
