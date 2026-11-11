const test = require("node:test");
const assert = require("node:assert/strict");
const c = require("../contributions");

test("notes need English or Urdu text within 4000 chars", () => {
  assert.ok(c.validateNote({}).errors.length);
  assert.deepEqual(c.validateNote({ bodyUrdu: " یاد " }).payload, { bodyUrdu: "یاد" });
  assert.equal(c.validateNote({ body: "x".repeat(4000) }).errors.length, 0);
  assert.ok(c.validateNote({ body: "x".repeat(4001) }).errors.length);
});

test("citations require a source and only accept http(s) links", () => {
  assert.ok(c.validateCitation({ url: "https://a.b" }).errors.length);
  assert.ok(c.validateCitation({ source: "S", url: "javascript:alert(1)" }).errors.length);
  assert.ok(c.validateCitation({ source: "S", url: "ftp://a.b" }).errors.length);
  assert.deepEqual(c.validateCitation({ source: " S ", url: "https://a.b/x" }).payload, { source: "S", url: "https://a.b/x" });
});

test("corrections only touch allow-listed fields and need a reason", () => {
  assert.ok(c.validateCorrection({ field: "title", value: "X", reason: "r" }, "work").errors.length);
  assert.ok(c.validateCorrection({ field: "language", value: "Urdu", reason: "r" }, "author").errors.length);
  assert.ok(c.validateCorrection({ field: "year", value: "1951" }, "work").errors.length);
  assert.ok(c.validateCorrection({ field: "year", value: "x".repeat(21), reason: "r" }, "work").errors.length);
  assert.deepEqual(c.validateCorrection({ field: "bio", value: "New", reason: "Source" }, "author").payload, { field: "bio", value: "New", reason: "Source" });
});

test("targets resolve case-insensitively and duplicates are flagged", () => {
  const data = { works: [{ title: "First Work" }, { title: "Same Title" }, { title: "same title " }], authors: [{ name: "Test Author" }] };
  assert.equal(c.resolveTarget(data, "work", " first work").status, "ok");
  assert.deepEqual(c.resolveTarget(data, "work", "Same Title"), { status: "duplicate", count: 2 });
  assert.equal(c.resolveTarget(data, "author", "Nobody").status, "missing");
});

test("status transitions", () => {
  assert.equal(c.nextStatus("pending", "approve"), "approved");
  assert.equal(c.nextStatus("changes_requested", "edit"), "pending");
  assert.equal(c.nextStatus("approved", "retract"), "retracted");
  assert.equal(c.nextStatus("approved", "approve"), null);
  assert.equal(c.nextStatus("rejected", "edit"), null);
});
