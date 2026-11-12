const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, api, join } = require("./helpers");

const OFFLINE = "The archive database is temporarily unavailable. Please try again later.";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixYear = { type: "correction", targetKind: "work", target: "First Work", field: "year", value: "1951", reason: "Library record" };

async function setup() {
  const server = await startServer({ moderators: "mod@test.dev,mod2@test.dev" });
  const ann = await join(server.base, { email: "ann@test.dev", displayName: "Ann" });
  const mod = await join(server.base, { email: "mod@test.dev", displayName: "Mo" });
  const mod2 = await join(server.base, { email: "mod2@test.dev", displayName: "Mo2" });
  const submit = (body) => api(server.base, "/api/submissions", { token: ann, body }).then((r) => r.body);
  const decide = (token, item, body) =>
  api(server.base, `/api/submissions/${item.id}/decide`, { token, body: { version: item.version, ...body } });
  return { ...server, ann, mod, mod2, submit, decide };
}

test("approving needs the version the moderator saw", async (t) => {
  const s = await setup();
  t.after(s.stop);
  const seen = await s.submit({ type: "note", targetKind: "work", target: "First Work", body: "A careful note" });
  const edited = await api(s.base, `/api/submissions/${seen.id}`, { token: s.ann, method: "PATCH", body: { body: "SPAM unseen text" } });
  assert.notEqual(edited.body.version, seen.version);
  assert.equal((await s.decide(s.mod, seen, { decision: "approve" })).status, 409);
  assert.equal((await s.decide(s.mod, { id: seen.id }, { decision: "approve" })).status, 400);
  assert.equal((await s.decide(s.mod, edited.body, { decision: "approve" })).status, 200);
});

test("approve and reject at the same moment never leave the graph written and the row rejected", async (t) => {
  const s = await setup();
  t.after(s.stop);
  let writes = 0;
  require("../archive").writeArchive = async () => {
    await sleep(300);
    writes += 1;
    return [];
  };
  const fix = await s.submit(fixYear);
  const approving = s.decide(s.mod, fix, { decision: "approve" });
  await sleep(50);
  const rejecting = await s.decide(s.mod2, fix, { decision: "reject", note: "Wrong year" });
  const approved = await approving;
  const row = await api(s.base, `/api/submissions/${fix.id}`, { token: s.ann });
  assert.equal(writes, 1);
  assert.deepEqual([approved.status, rejecting.status, row.body.status], [200, 409, "approved"]);
});

test("approving keywords while the archive database is offline gives the offline message", async (t) => {
  const s = await setup();
  t.after(s.stop);
  const keywords = await s.submit({ type: "add_keywords", targetKind: "work", target: "First Work", keywords: ["exile"] });
  const res = await s.decide(s.mod, keywords, { decision: "approve" });
  assert.deepEqual([res.status, res.body.error], [503, OFFLINE]);
  assert.equal((await api(s.base, `/api/submissions/${keywords.id}`, { token: s.ann })).body.status, "pending");
});

test("approving a correction logs the value it overwrote", async (t) => {
  const s = await setup();
  t.after(s.stop);
  require("../archive").writeArchive = async () => [];
  const fix = await s.submit(fixYear);
  assert.equal((await s.decide(s.mod, fix, { decision: "approve" })).status, 200);
  const history = await api(s.base, `/api/submissions/${fix.id}/history`, { token: s.mod });
  const approval = history.body.find((e) => e.action === "submission.approved");
  assert.deepEqual(approval.details, { field: "year", overwritten: "1950", value: "1951" });
});
