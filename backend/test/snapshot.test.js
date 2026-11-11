const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { startServer, api } = require("./helpers");

test("fallback prefers the live snapshot and reports its date", async (t) => {
  const { base, stop } = await startServer();
  t.after(stop);
  const cache = require("../archiveCache");
  const { config } = require("../config");

  assert.equal((await api(base, "/api/public/meta")).body.takenAt, "2026-09-14T00:00:00.000Z");

  cache.writeLiveSnapshot({ authorRows: [{ author: { name: "Live Author" }, works: 0 }], workRows: [] });
  assert.equal(fs.existsSync(config.archiveLiveSnapshot + ".tmp"), false);
  const data = await cache.load({ force: true });
  assert.deepEqual(data.authors.map((a) => a.name), ["Live Author"]);
  assert.notEqual(data.meta.takenAt, "2026-09-14T00:00:00.000Z");
});
