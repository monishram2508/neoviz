const test = require("node:test");
const assert = require("node:assert/strict");
const { rank, atLeast, effectiveRole, canManage, canAssign } = require("../roles");

test("ranks order the four roles and treat unknown as contributor", () => {
  assert.deepEqual(["contributor", "moderator", "admin", "sysadmin", "reader", undefined].map(rank), [0, 1, 2, 3, 0, 0]);
  assert.equal(atLeast("admin", "moderator"), true);
  assert.equal(atLeast("moderator", "admin"), false);
});

test("sysadmin comes from the env list, case-insensitively, and overrides the stored role", () => {
  assert.equal(effectiveRole({ email: "ROOT@test.dev", role: "contributor" }, ["root@test.dev"]), "sysadmin");
  assert.equal(effectiveRole({ email: "x@test.dev", role: "admin" }, ["root@test.dev"]), "admin");
  assert.equal(effectiveRole({ email: "x@test.dev", role: "reader" }, []), "contributor");
});

test("you can only manage and assign strictly below your own rank", () => {
  assert.equal(canManage("admin", "moderator"), true);
  assert.equal(canManage("admin", "admin"), false);
  assert.equal(canAssign("admin", "moderator"), true);
  assert.equal(canAssign("admin", "admin"), false);
  assert.equal(canAssign("sysadmin", "admin"), true);
  assert.equal(canAssign("sysadmin", "sysadmin"), false);
});
