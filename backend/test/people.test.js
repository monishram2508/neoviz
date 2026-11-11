const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, api, join } = require("./helpers");

test("approved contributions and profiles", async (t) => {
  const { base, stop } = await startServer({ moderators: "mod@test.dev" });
  t.after(stop);
  const ann = await join(base, { email: "ann@test.dev", displayName: "Ann" });
  const mod = await join(base, { email: "mod@test.dev", displayName: "Mo" });
  const annId = (await api(base, "/api/me", { token: ann })).body.id;
  const mk = (body) => api(base, "/api/submissions", { token: ann, body }).then((r) => r.body);

  const cite = await mk({ type: "citation", targetKind: "work", target: "First Work", source: "Catalogue", url: "https://x.org" });
  await mk({ type: "note", targetKind: "work", target: "First Work", body: "Waiting" });
  await api(base, `/api/submissions/${cite.id}/decide`, { token: mod, body: { decision: "approve", version: cite.version } });

  const work = await api(base, "/api/public/works/first-work");
  assert.deepEqual(work.body.contributions.map((c) => [c.type, c.source, c.contributor.displayName]), [["citation", "Catalogue", "Ann"]]);

  const pub = await api(base, `/api/public/people/${annId}`);
  assert.equal(pub.body.email, undefined);
  assert.deepEqual(pub.body.contributions.map((c) => c.target.slug), ["first-work"]);

  const full = await api(base, `/api/people/${annId}/full`, { token: ann });
  assert.deepEqual(full.body.submissions.map((s) => s.status).sort(), ["approved", "pending"]);
  assert.equal(full.body.log, undefined);
  assert.equal((await api(base, `/api/people/${annId}/full`, { token: mod })).status, 403);

  await api(base, "/api/me", { token: ann, method: "PATCH", body: { showEmail: true } });
  assert.equal((await api(base, `/api/public/people/${annId}`)).body.email, "ann@test.dev");
});
