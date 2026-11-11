# Contributions, Moderation and Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registered users contribute notes, citations, corrections, keywords and new works to the Bayaaz-e-Hayaat archive; moderators review them; admins and env-defined sysadmins manage people; everything is logged.

**Architecture:** Extend the existing Express + SQLite submission pipeline (`backend/submissions.js`). Pure rules (ranks, payload validation, status transitions) live in small modules with unit tests; routes are covered by integration tests that boot the real app against a temp SQLite file and a fixture snapshot (no Neo4j). The archive frontend (`frontend/src/archive/`) gains an account context and seven pages inside the existing `Layout`.

**Tech Stack:** Node 26, Express 4, `sqlite3`, `neo4j-driver`, `jsonwebtoken`, `bcrypt`, `express-rate-limit` (new), `node:test`; React 18 (CRA), react-router v6.

**Spec:** `docs/superpowers/specs/2026-11-11-contributions-design.md`

**Out of scope for this plan:** email verification (spec section marked not-to-build), anything depending on the open "master copy" question (spreadsheet import merge, approved-changes CSV export).

## Global Constraints

- No comments in any code file (developer's push rule). Tests included.
- Only new dependency: `express-rate-limit` in `backend/`. No new frontend dependencies.
- Backend tests: `node --test`, run with `npm test` in `backend/`. Frontend tests: `CI=true npx react-scripts test --watchAll=false src/archive`.
- Roles stored: `contributor`, `moderator`, `admin`. `sysadmin` is derived from `SYSADMIN_EMAILS` on every request and never stored. Legacy `reader` = contributor.
- Ranks: contributor 0, moderator 1, admin 2, sysadmin 3. Act only on accounts strictly below your rank; assign only roles strictly below your rank.
- Limits: display name 2–40 chars; password ≥ 8; note `body`/`bodyUrdu` ≤ 4000 each; citation `source` ≤ 1000, `url` ≤ 500 (http/https only), `comment` ≤ 2000; correction `reason` ≤ 2000; correctable fields work `year` ≤ 20, `engInfo` ≤ 8000, `urduInfo` ≤ 8000, author `bio` ≤ 8000; max 20 pending + changes-requested per user.
- Rate limits: login + register 10 per 15 min per IP; submission create 30 per hour per user; both skipped when `NODE_ENV=test`.
- JWT `expiresIn: "7d"`.
- Emails trimmed + lowercased on register, login and env lists. Emails never appear in any public response unless `show_email = 1`. Moderators see display names, not emails.
- Graph writes credit `user:<id>`.
- User text rendered as plain text; Urdu inputs and output use `dir="rtl" lang="ur"`; citation links use `rel="nofollow noopener ugc"` and `target="_blank"`.
- Exact copy:
  - duplicate: `This title matches more than one record in the archive. The archive team needs to resolve the duplicate first.`
  - picker duplicate label: `Duplicate record — waiting for the archive team`
  - offline: `The archive database is offline — try again later.`
  - disabled: `This account is disabled`
  - login failure: `Wrong email or password`
  - reason missing: `A reason is required to reject or request changes.`
  - self review: `You can't review your own contribution.`
  - no display name: `Set a display name on your profile before contributing.`
  - pending cap: `You have 20 contributions waiting for review. Please wait for some to be reviewed before adding more.`
  - submit success: `Thanks — this is waiting for review.`
- Light theme is the default; every new page must also look right with `data-theme="dark"` and at 375 px width.

## Review Focus

1. Approving a correction while Neo4j is unreachable must leave it `pending` and return 503 with the offline copy — Task 6.
2. A citation `url` of `javascript:alert(1)` (or any non-http scheme) must be rejected — Task 4.
3. `Root@Test.dev` in `SYSADMIN_EMAILS` and a login typed as `ROOT@test.dev` must still yield sysadmin — Tasks 1 and 3.
4. Two moderators deciding the same item: the second gets 409 and nothing is logged twice — Task 6.
5. A moderator demoted while signed in must be refused on their next decide (no stale JWT privilege) — Task 9.

---

## File Map

Backend (`v4/backend/`):
- `roles.js` (new) — rank rules, pure.
- `sql.js` (new) — promise wrappers over the shared `sqlite3` handle.
- `audit.js` (new) — append-only activity log.
- `contributions.js` (new) — payload validators, target resolution, status transitions, pure.
- `limits.js` (new) — rate limiters.
- `auth.js` (new) — register / login / me routes (moved out of `index.js`).
- `people.js` (new) — public contributions, public and full profiles.
- `admin.js` (new) — users, roles, disable / enable / delete, audit, system.
- `config.js`, `db.js`, `middleware.js`, `index.js`, `submissions.js`, `public.js`, `archiveCache.js` (modify).
- `test/helpers.js`, `test/fixtures/snapshot.json`, `test/*.test.js` (new).

Frontend (`v4/frontend/src/`):
- `archive/account.js` (new) — `AccountProvider`, `useAccount`, `atLeast`.
- `archive/memberApi.js` (new) — authenticated calls.
- `archive/SignIn.js`, `archive/Join.js`, `archive/Contribute.js`, `archive/ContributionForm.js`, `archive/ContributionItem.js`, `archive/Profile.js`, `archive/Review.js`, `archive/Admin.js`, `archive/System.js` (new).
- `App.js`, `archive/Layout.js`, `archive/Work.js`, `archive/Author.js`, `archive/archive.css` (modify).
- `Auth/` folder (delete: `Login.js`, `Register.js`, `auth.css` are only used by the old routes).

Docs: `backend/.env.example`, `docs/deploy-mac-mini.md` (new), `CLAUDE.md`.

---

### Task 1: Roles, ranks and role-aware middleware

**Files:**
- Create: `backend/roles.js`, `backend/test/roles.test.js`
- Modify: `backend/config.js`, `backend/middleware.js`, `backend/package.json`

**Interfaces:**
- Produces (`roles.js`): `STORED_ROLES = ["contributor","moderator","admin"]`; `rank(role: string) -> 0..3` (unknown → 0); `atLeast(role, min) -> boolean`; `effectiveRole({ email, role }, sysadminEmails: string[]) -> string`; `canManage(actorRole, targetRole) -> boolean`; `canAssign(actorRole, newRole) -> boolean`.
- Produces (`config.js`): `config.sysadminEmails`, `config.adminEmails` (lowercased arrays, same parsing as `moderatorEmails`), `config.trustProxy` (from `TRUST_PROXY`: empty → `false`, all digits → `Number`, else the string), `config.archiveLiveSnapshot` (`ARCHIVE_LIVE_SNAPSHOT` resolved like `DB_FILE`; default `path.join(path.dirname(config.dbFile), "archive_live.json")`).
- Produces (`middleware.js`): `loadRole` sets `req.account = { id, email, role, displayName }` with `role` from `effectiveRole`, and rejects `disabled_at` accounts with 403 `This account is disabled`; `requireRole(min: string)` returns `[authMiddleware, loadRole, guard]`, guard = `atLeast(req.account.role, min)` else 403 `{ error: "Requires " + min + " or higher" }`.

- [ ] **Step 1: Write the failing tests** in `backend/test/roles.test.js`

```js
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
```

- [ ] **Step 2: Set `"test": "node --test test/"` in `backend/package.json`, run `npm test`** — Expected: FAIL, `Cannot find module '../roles'`.
- [ ] **Step 3: Implement `roles.js`, the four config keys, and the `loadRole` / `requireRole` changes.** `loadRole` selects `id, email, role, display_name, disabled_at`. Existing `requireRole("moderator")` call sites in `submissions.js` keep working unchanged.
- [ ] **Step 4: Run `npm test`** — Expected: 3 passing.
- [ ] **Step 5: Commit** — `feat: rank-based roles with env-derived sysadmin`

---

### Task 2: Schema, SQL helpers, activity log, test harness

**Files:**
- Create: `backend/sql.js`, `backend/audit.js`, `backend/test/helpers.js`, `backend/test/fixtures/snapshot.json`, `backend/test/audit.test.js`
- Modify: `backend/db.js`, `backend/index.js`

**Interfaces:**
- Produces (`sql.js`): `run(sql, params = []) -> Promise<{ lastID, changes }>`, `get(sql, params = []) -> Promise<row | undefined>`, `all(sql, params = []) -> Promise<row[]>`.
- Produces (`db.js`): still `module.exports = db`, plus `db.ready: Promise<void>` that resolves after every migration below has run.
- Produces (`audit.js`): `ACTIONS` (frozen array of the spec's 14 action names); `logEvent({ actorId = null, action, submissionId = null, subjectUserId = null, reason = null, details = null }) -> Promise<number>` (throws `Unknown audit action: <action>` before touching the DB; stores `details` as JSON); `eventsForSubmission(id) -> rows oldest first`; `eventsForUser(userId) -> rows newest first` (actor = user, subject = user, or submission owned by user); `recentEvents({ before = null, limit = 50 }) -> rows newest first, id < before, limit capped at 200`. Each row: `{ id, at, actorId, actorName, action, submissionId, subjectUserId, reason, details }` with `details` parsed and `actorName` from a `LEFT JOIN users`.
- Produces (`index.js`): `module.exports = app`; `app.listen` only when `require.main === module`.
- Produces (`test/helpers.js`): `startServer({ sysadmins = "root@test.dev", admins = "", moderators = "" } = {}) -> Promise<{ base, stop }>` — sets `NODE_ENV=test`, `JWT_SECRET=test-secret`, `DB_FILE`, `UPLOAD_DIR`, `ARCHIVE_LIVE_SNAPSHOT` inside a fresh `fs.mkdtempSync` dir, `ARCHIVE_NEO4J_URI=""`, `ARCHIVE_SNAPSHOT` = the fixture, `SYSADMIN_EMAILS` / `ADMIN_EMAILS` / `MODERATOR_EMAILS` from the options, `GROQ_API_KEY=""`; requires `../index`, awaits `require("../db").ready`, listens on port 0. `api(base, path, { token, method, body } = {}) -> Promise<{ status, body }>` (JSON). `join(base, { email, displayName, password = "password123" }) -> Promise<token>` (uses `/api/register`, available after Task 3).
- Fixture `test/fixtures/snapshot.json` (`{ takenAt, nodes: [{ nid, labels, p }], rels: [{ t, a, b }] }`): authors nid 1 `{ name: "Test Author", language: "Urdu", bio: "Old bio" }`, nid 2 and nid 3 both `{ name: "Twin Author", language: "Telugu" }`; works nid 10 `{ title: "First Work", year: "1950", engInfo: "Old description", keywords: ["memory"] }`, nid 11 `{ title: "Same Title", year: "1945" }`, nid 12 `{ title: "Same Title", year: "1980" }`; WROTE rels 1→10, 1→11, 2→12. `takenAt: "2026-09-14T00:00:00.000Z"`.

Migrations in `db.js` (existing `PRAGMA table_info` pattern): `PRAGMA journal_mode = WAL`; `users` add `display_name TEXT`, `show_email INTEGER NOT NULL DEFAULT 0`, `disabled_at DATETIME`; `submissions` add `target_kind TEXT`, `updated_at DATETIME`; `CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at DATETIME DEFAULT CURRENT_TIMESTAMP, actor_id INTEGER, action TEXT NOT NULL, submission_id INTEGER, subject_user_id INTEGER, reason TEXT, details TEXT)` with indexes on `submission_id`, `subject_user_id`, `actor_id`; seed `ADMIN_EMAILS` → `role = 'admin'` alongside the existing moderator seed (promote only); `console.warn` once if `SELECT lower(email) FROM users GROUP BY lower(email) HAVING count(*) > 1` returns rows.

- [ ] **Step 1: Write the failing test** `backend/test/audit.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("./helpers");

test("activity log", async (t) => {
  const { stop } = await startServer();
  t.after(stop);
  const { all } = require("../sql");
  const { logEvent, eventsForSubmission, recentEvents } = require("../audit");

  const cols = (await all("PRAGMA table_info(users)")).map((c) => c.name);
  assert.ok(["display_name", "show_email", "disabled_at"].every((c) => cols.includes(c)));

  await assert.rejects(logEvent({ action: "submission.deleted" }), /Unknown audit action/);
  await logEvent({ action: "submission.created", submissionId: 7, details: { a: 1 } });
  await logEvent({ action: "submission.rejected", submissionId: 7, reason: "off-topic" });
  const rows = await eventsForSubmission(7);
  assert.deepEqual(rows.map((r) => r.action), ["submission.created", "submission.rejected"]);
  assert.deepEqual(rows[0].details, { a: 1 });
  assert.equal((await recentEvents({ limit: 1 }))[0].action, "submission.rejected");
});
```

- [ ] **Step 2: Run `npm test`** — Expected: FAIL (`Cannot find module './helpers'` or `../audit`).
- [ ] **Step 3: Implement `sql.js`, `audit.js`, the migrations, `db.ready`, the `index.js` export, `helpers.js` and the fixture.**
- [ ] **Step 4: Run `npm test`** — Expected: all passing.
- [ ] **Step 5: Commit** — `feat: activity log, schema migrations, integration test harness`

---

### Task 3: Accounts — register, login, me; lock the NeoViz tool

**Files:**
- Create: `backend/auth.js`, `backend/limits.js`, `backend/test/auth.test.js`
- Modify: `backend/index.js`, `backend/package.json` (`npm install express-rate-limit`)

**Interfaces:**
- Consumes: `effectiveRole`, `requireRole` (Task 1); `run/get` (Task 2); `logEvent` (Task 2).
- Produces (`limits.js`): `authLimiter` (15 min / 10 per IP), `submitLimiter` (60 min / 30, `keyGenerator: (req) => String(req.account.id)`); both `skip: () => config.nodeEnv === "test"`, JSON message `{ error: "Too many attempts. Try again later." }`.
- Produces (`auth.js` router, mounted with `api.use(authRouter)`):
  - `POST /register { email, password, displayName, showEmail? }` → 400 with a specific message for bad email (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`), short password, display name outside 2–40; 400 `User already exists`; role seeded `admin` if in `ADMIN_EMAILS`, else `moderator` if in `MODERATOR_EMAILS`, else `contributor`; logs `user.registered`; returns `201 { token }`.
  - `POST /login { email, password }` → 400 `Wrong email or password` for unknown email or bad password; 403 `This account is disabled`; `200 { token }` signed `{ id }` with `expiresIn: "7d"`.
  - `GET /me` (auth + loadRole) → `{ id, email, displayName, showEmail: boolean, role }`.
  - `PATCH /me { displayName?, showEmail? }` → validates, updates, logs `user.profile_changed` with `details: { from, to }`, returns the same shape as `GET /me`.
- `index.js`: delete the old `/register`, `/login`, `/me`, `/sendContribution` handlers; swap `authMiddleware` for `...requireRole("sysadmin")` on `/connect`, `/query`, `/save-connection`, `/connections`, `/nl-query`, `/explain`; `if (config.trustProxy !== false) app.set("trust proxy", config.trustProxy)`.

- [ ] **Step 1: Write the failing tests** `backend/test/auth.test.js`

```js
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
  assert.deepEqual([bad.status, bad.body.error], [400, "Wrong email or password"]);
  assert.equal((await api(base, "/api/login", { body: { email: "ANN@test.dev", password: "password123" } })).status, 200);

  assert.equal((await api(base, "/api/query", { token, body: { cypher: "RETURN 1" } })).status, 403);

  const root = await join(base, { email: "ROOT@test.dev", displayName: "Root" });
  assert.equal((await api(base, "/api/me", { token: root })).body.role, "sysadmin");

  const patched = await api(base, "/api/me", { token, method: "PATCH", body: { displayName: "Ann K", showEmail: true } });
  assert.deepEqual([patched.body.displayName, patched.body.showEmail], ["Ann K", true]);
});
```

- [ ] **Step 2: Run `npm test`** — Expected: FAIL (register still the old handler / 404 on PATCH).
- [ ] **Step 3: Implement `limits.js`, `auth.js`, the `index.js` changes.**
- [ ] **Step 4: Run `npm test`** — Expected: all passing.
- [ ] **Step 5: Commit** — `feat: hardened accounts with display names; NeoViz tool restricted to sysadmins`

---

### Task 4: Contribution rules (pure)

**Files:**
- Create: `backend/contributions.js`, `backend/test/contributions.test.js`

**Interfaces:**
- Produces:
  - `TYPES = ["new_work","add_keywords","note","citation","correction"]`; `STATUSES = ["pending","changes_requested","approved","rejected","withdrawn","retracted"]`; `TARGET_KINDS = { note: ["work","author"], citation: ["work","author"], correction: ["work","author"], add_keywords: ["work"], new_work: [] }`; `CORRECTABLE = { work: { year: 20, engInfo: 8000, urduInfo: 8000 }, author: { bio: 8000 } }`; `SQLITE_ONLY = ["note","citation"]`.
  - `validateNote(body) -> { errors: string[], payload: { body?, bodyUrdu? } }`
  - `validateCitation(body) -> { errors, payload: { source, url?, comment? } }` — `url` must parse with `new URL()` and have protocol `http:` or `https:`.
  - `validateCorrection(body, targetKind) -> { errors, payload: { field, value, reason } }` — `field` must be a key of `CORRECTABLE[targetKind]`; `value` length ≤ that field's limit (the route adds `before`).
  - `resolveTarget(data, kind, key) -> { status: "ok", node } | { status: "missing" } | { status: "duplicate", count }` — `data` is the archive cache; matches `trim().toLowerCase()` of `work.title` / `author.name`.
  - `nextStatus(from, action) -> string | null` — table: pending: approve→approved, reject→rejected, request_changes→changes_requested, edit→pending, withdraw→withdrawn; changes_requested: edit→pending, withdraw→withdrawn; approved: retract→retracted; everything else null.

- [ ] **Step 1: Write the failing tests** `backend/test/contributions.test.js`

```js
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
```

- [ ] **Step 2: Run `npm test`** — Expected: FAIL, `Cannot find module '../contributions'`.
- [ ] **Step 3: Implement `contributions.js`.** Trim every string; omit empty optional fields from `payload`.
- [ ] **Step 4: Run `npm test`** — Expected: all passing.
- [ ] **Step 5: Commit** — `feat: contribution validation, target resolution and status rules`

---

### Task 5: Submitting, editing, withdrawing, history, queue

**Files:**
- Modify: `backend/submissions.js`
- Create: `backend/test/submissions.test.js`

**Interfaces:**
- Consumes: Task 4 module; `logEvent`, `eventsForSubmission` (Task 2); `submitLimiter` (Task 3); `load` from `archiveCache.js`.
- Changes:
  - `TYPES` / `STATUSES` come from `contributions.js`. `validate(type, body)` delegates `note` / `citation` / `correction` to the Task 4 validators; existing branches unchanged.
  - `POST /submissions` middleware order: `authMiddleware, loadRole, submitLimiter, upload.single("file")`. Body adds `targetKind` and `target` for note/citation/correction. Checks in order: display name (400 copy), type, `targetKind` allowed for type, payload errors (400), `resolveTarget` → missing 400 `No such <kind> in the archive`, duplicate 409 copy; pending + changes_requested count ≥ 20 → 409 copy. Stores `target` as the cache's canonical `title` / `name`, and `target_kind`; correction payload gains `before: node[field] ?? null`. `add_keywords` resolves through the same path with kind `work`. Logs `submission.created`.
  - `PATCH /submissions/:id` (owner only, else 403): `nextStatus(status, "edit")` else 409; re-validate with the stored type and target (target cannot change); recompute `before` for corrections; `UPDATE ... SET payload = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`; logs `submission.edited` with `details: { previous }`.
  - `POST /submissions/:id/withdraw` (owner only): `nextStatus(status, "withdraw")` else 409; logs `submission.withdrawn`.
  - `GET /submissions/:id/history`: owner or moderator+. For a viewer below moderator, remove `actorId` and `actorName` from events whose action is a decision.
  - `rowToSubmission` (exported) returns `submittedBy: { id: row.user_id, displayName: row.display_name || null }` and `targetKind`; it no longer returns the email. Queue (`GET /submissions`) accepts `type` as well as `status`, sorts oldest first.
  - Remove `GET /users` and `POST /users/:id/role` (re-created in Task 9).

- [ ] **Step 1: Write the failing tests** `backend/test/submissions.test.js`

```js
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
```

- [ ] **Step 2: Run `npm test`** — Expected: FAIL (400 on unknown type `note`).
- [ ] **Step 3: Implement the `submissions.js` changes.**
- [ ] **Step 4: Run `npm test`** — Expected: all passing.
- [ ] **Step 5: Commit** — `feat: note, citation and correction submissions with edit, withdraw and history`

---

### Task 6: Deciding, previewing and retracting

**Files:**
- Modify: `backend/submissions.js`
- Create: `backend/test/decide.test.js`

**Interfaces:**
- Consumes: Tasks 4–5; `archive.writeArchive`; `load({ force: true })`.
- Changes:
  - `buildPlan(row, overrides)`: call `archive.vocabularyMap()` only for `add_keywords` / `new_work`. `note` / `citation` → `{ plan: { type, sqliteOnly: true }, statements: [] }`. `correction` → `plan.correction = { kind, target, field, before, current, after, changedSinceSubmit }` with `current` read from the cache; one statement `MATCH (w:Work) WHERE toLower(trim(w.title)) = $t SET w.<field> = $value, w.lastContributionBy = $by, w.lastContributionAt = datetime() RETURN w.title AS title` (author: `MATCH (a:Author) WHERE toLower(trim(a.name)) = $t SET a.<field> = ...`), where `<field>` is interpolated only after checking it is a key of `CORRECTABLE[kind]`. Every type with a target re-runs `resolveTarget` and returns `plan.blocked = true` with the duplicate or missing message. `$by` is `user:<row.user_id>` everywhere, including the existing branches.
  - `isOffline(err) -> boolean`: true when `!config.archive.uri`, or `err.code` is `ServiceUnavailable`, `SessionExpired`, `ENOTFOUND`, `ECONNREFUSED` or `ETIMEDOUT`.
  - `POST /submissions/:id/decide { decision, note, keywordOverrides }`: 400 reason copy when `decision` is `reject` / `request_changes` and `note` is empty; 403 self-review copy when the decider owns the row and their role is `moderator`; 409 when `nextStatus` is null; approve with `plan.blocked` → 409 with the plan message; for non-SQLite types `writeArchive` first — `isOffline` → 503 offline copy, other errors → 502 `Could not write to the archive: <message>`; then `UPDATE ... WHERE id = ? AND status = 'pending'` — 0 changes → 409 `Already decided`; then `load({ force: true }).catch(console.error)` for non-SQLite types; logs `submission.approved` / `.rejected` / `.changes_requested` with `reason` = note.
  - `POST /submissions/:id/retract { reason }` (`requireRole("admin")`): only `note` / `citation` in `approved`; reason required (400 `A reason is required.`); sets `retracted`; logs `submission.retracted`.

- [ ] **Step 1: Write the failing tests** `backend/test/decide.test.js`

```js
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
  const submit = (token, body) => api(base, "/api/submissions", { token, body }).then((r) => r.body.id);
  const decide = (token, id, body) => api(base, `/api/submissions/${id}/decide`, { token, body });

  const n1 = await submit(ann, { type: "note", targetKind: "work", target: "First Work", body: "A" });
  assert.equal((await decide(mod, n1, { decision: "reject" })).status, 400);
  assert.equal((await decide(ann, n1, { decision: "approve" })).status, 403);
  assert.equal((await decide(mod, n1, { decision: "approve" })).status, 200);
  assert.equal((await decide(mod2, n1, { decision: "approve" })).status, 409);

  const own = await submit(mod, { type: "note", targetKind: "work", target: "First Work", body: "B" });
  assert.equal((await decide(mod, own, { decision: "approve" })).body.error, "You can't review your own contribution.");

  const fix = await submit(ann, { type: "correction", targetKind: "work", target: "First Work", field: "year", value: "1951", reason: "Library record" });
  const preview = await api(base, `/api/submissions/${fix}/preview`, { token: mod });
  assert.deepEqual([preview.body.plan.correction.before, preview.body.plan.correction.after], ["1950", "1951"]);
  const offline = await decide(mod, fix, { decision: "approve" });
  assert.deepEqual([offline.status, offline.body.error], [503, "The archive database is offline — try again later."]);
  assert.equal((await api(base, `/api/submissions/${fix}`, { token: ann })).body.status, "pending");

  const retract = (token, body) => api(base, `/api/submissions/${n1}/retract`, { token, body });
  assert.equal((await retract(mod, { reason: "x" })).status, 403);
  assert.equal((await retract(boss, {})).status, 400);
  assert.equal((await retract(boss, { reason: "Spam" })).status, 200);

  const history = await api(base, `/api/submissions/${n1}/history`, { token: ann });
  assert.equal(history.body.filter((e) => e.action === "submission.approved").length, 1);
  assert.equal(history.body.find((e) => e.action === "submission.approved").actorName, undefined);
});
```

- [ ] **Step 2: Run `npm test`** — Expected: FAIL (reject without reason currently succeeds).
- [ ] **Step 3: Implement the `submissions.js` changes.**
- [ ] **Step 4: Run `npm test`** — Expected: all passing.
- [ ] **Step 5: Commit** — `feat: reasons, self-review guard, corrections, duplicate guard and retraction in moderation`

---

### Task 7: Live fallback snapshot and banner date data

**Files:**
- Modify: `backend/archiveCache.js`
- Create: `backend/test/snapshot.test.js`

**Interfaces:**
- Produces (`archiveCache.js`, added to `module.exports`): `writeLiveSnapshot(rows: { authorRows, workRows }, file = config.archiveLiveSnapshot) -> void` — writes `{ takenAt: new Date().toISOString(), authorRows, workRows }` to `file + ".tmp"` then `fs.renameSync`; `readFallback() -> { rows, takenAt }` — the live file when it exists, else the existing `fromSnapshot()` result with the backup's `takenAt`.
- `load()`: on a successful Neo4j read, call `writeLiveSnapshot` (catch and `console.error` failures); on failure use `readFallback()`. `meta.takenAt` is set for every source (Neo4j: same as `loadedAt`).

- [ ] **Step 1: Write the failing test** `backend/test/snapshot.test.js`

```js
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
```

- [ ] **Step 2: Run `npm test`** — Expected: FAIL (`takenAt` undefined).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`** — Expected: all passing.
- [ ] **Step 5: Commit** — `feat: keep a live fallback snapshot after each Neo4j load`

---

### Task 8: Public contributions and profiles

**Files:**
- Create: `backend/people.js`, `backend/test/people.test.js`
- Modify: `backend/public.js`, `backend/index.js` (mount `peopleRouter`)

**Interfaces:**
- Consumes: `sql.all/get`, `eventsForUser`, `load`, `atLeast`, `rowToSubmission`.
- Produces (`people.js`):
  - `approvedFor(kind, key) -> Promise<Item[]>` — approved notes and citations whose `target_kind = kind` and `lower(trim(target)) = lower(trim(key))`, oldest first by `decided_at`. `Item = { id, type, body?, bodyUrdu?, source?, url?, comment?, approvedAt, contributor: { id, displayName } | null }` (null when the user row is gone).
  - `publicProfile(id, data) -> Promise<null | { id, displayName, email?, contributions: Array<{ id, type, approvedAt, payload, target: { kind, label, slug } }> }>` — `email` present only when `show_email = 1`; contributions are every approved submission (all types); `target.kind` is `work` for `new_work`; `slug` resolved through `data` (null when unresolved).
  - Router: `GET /people/:id/full` (auth + loadRole; owner or admin+, else 403) → `{ ...publicProfile, email, showEmail, role, submissions: rowToSubmission[] (every status, with moderatorNote), log?: eventsForUser rows (admin+ only) }`. `role` is the effective role.
- `public.js`: `GET /works/:slug` adds `contributions: await approvedFor("work", work.title)`; `GET /authors/:slug` adds `contributions: await approvedFor("author", author.name)`; new `GET /people/:id` → `publicProfile` or 404 `No such person`.

- [ ] **Step 1: Write the failing test** `backend/test/people.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, api, join } = require("./helpers");

test("approved contributions and profiles", async (t) => {
  const { base, stop } = await startServer({ moderators: "mod@test.dev" });
  t.after(stop);
  const ann = await join(base, { email: "ann@test.dev", displayName: "Ann" });
  const mod = await join(base, { email: "mod@test.dev", displayName: "Mo" });
  const annId = (await api(base, "/api/me", { token: ann })).body.id;
  const mk = (body) => api(base, "/api/submissions", { token: ann, body }).then((r) => r.body.id);

  const cite = await mk({ type: "citation", targetKind: "work", target: "First Work", source: "Catalogue", url: "https://x.org" });
  await mk({ type: "note", targetKind: "work", target: "First Work", body: "Waiting" });
  await api(base, `/api/submissions/${cite}/decide`, { token: mod, body: { decision: "approve" } });

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
```

- [ ] **Step 2: Run `npm test`** — Expected: FAIL (`contributions` undefined).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`** — Expected: all passing.
- [ ] **Step 5: Commit** — `feat: approved contributions on public pages and contributor profiles`

---

### Task 9: People management, activity log and system endpoints

**Files:**
- Create: `backend/admin.js`, `backend/test/admin.test.js`
- Modify: `backend/index.js` (mount `adminRouter`)

**Interfaces:**
- Consumes: `canManage`, `canAssign`, `effectiveRole`, `requireRole`, `logEvent`, `recentEvents`, `load`, `config`.
- Produces (`admin.js` router):
  - `GET /users` (admin+) → `[{ id, email, displayName, role, disabled: boolean, pending, approved }]`, effective roles.
  - `POST /users/:id/role { role }` (admin+) → 404 unknown user; 403 `You can't change this account` unless `canManage(actor, target)`; 403 `You can't assign that role` unless `canAssign(actor, role)`; logs `user.role_changed` `{ from, to }`; returns `{ id, role }`.
  - `POST /users/:id/disable` / `/enable` (admin+, `canManage`) → sets / clears `disabled_at`; logs `user.disabled` / `user.enabled`.
  - `DELETE /users/:id` (sysadmin, `canManage`) → logs `user.deleted` with `details: { displayName }` first, then deletes the row; 204.
  - `GET /audit?before=&limit=` (admin+) → `recentEvents`.
  - `GET /system` (sysadmin) → `{ archive: meta, dbFile, dbBytes, uploadDir, liveSnapshot, liveSnapshotExists }`.
  - `POST /system/reload` (sysadmin) → `load({ force: true })`, logs `archive.reloaded`, returns `meta`.

- [ ] **Step 1: Write the failing test** `backend/test/admin.test.js`

```js
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
  assert.equal((await api(base, "/api/login", { body: { email: "ann@test.dev", password: "password123" } })).body.error, "This account is disabled");

  assert.equal((await api(base, "/api/system", { token: boss })).status, 403);
  assert.equal((await api(base, "/api/system", { token: root })).body.archive.source, "snapshot");

  const log = await api(base, "/api/audit", { token: root });
  assert.ok(log.body.some((e) => e.action === "user.role_changed" && e.details.to === "moderator"));
});
```

- [ ] **Step 2: Run `npm test`** — Expected: FAIL (404 on `/api/users/:id/role`).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `node --test --experimental-test-coverage test/`** — Expected: all passing; `roles.js`, `contributions.js`, `audit.js`, `auth.js`, `people.js`, `admin.js` each ≥ 80% lines.
- [ ] **Step 5: Commit** — `feat: admin people management, activity log and system endpoints`

---

### Task 10: Account state, header, sign in, join, banner date

**Files:**
- Create: `frontend/src/archive/account.js`, `frontend/src/archive/account.test.js`, `frontend/src/archive/memberApi.js`, `frontend/src/archive/SignIn.js`, `frontend/src/archive/Join.js`
- Modify: `frontend/src/App.js`, `frontend/src/archive/Layout.js`, `frontend/src/archive/archive.css`
- Delete: `frontend/src/Auth/`

**Interfaces:**
- Produces (`memberApi.js`): `send(path, { method = "GET", body } = {}) -> Promise<json>` using `apiFetch` from `../api`, JSON body, throws `Error(body.error)` with `.status` on non-2xx (204 → `null`). Named calls used by later tasks: `register`, `login`, `getMe`, `updateMe`, `submit`, `editSubmission(id, payload)`, `withdrawSubmission(id)`, `getSubmission(id)`, `getHistory(id)`, `getQueue({ status, type })`, `getPreview(id)`, `decide(id, { decision, note, keywordOverrides })`, `retract(id, reason)`, `getPerson(id)` (public), `getPersonFull(id)`, `getUsers()`, `setRole(id, role)`, `disableUser(id)`, `enableUser(id)`, `deleteUser(id)`, `getAudit({ before })`, `getSystem()`, `reloadArchive()`.
- Produces (`account.js`): `RANKS`, `atLeast(role, min) -> boolean` (same table as backend); `AccountProvider` (loads `getMe()` when `localStorage.token` exists; a 401/403 clears the token); `useAccount() -> { account | null, loading, signIn(token) -> Promise<void>, signOut(), refresh() }`.
- `App.js`: wrap routes in `AccountProvider`; inside `Layout` add `/signin`, `/join`, `/contribute`, `/people/:id`, `/review`, `/admin`, `/system` (pages from later tasks may be placeholders until their task lands); `/login` → `<Navigate to="/signin" replace />`, `/register` → `<Navigate to="/join" replace />`.
- `Layout.js` header: after `NAV`, `Contribute` always; `Review` (moderator+) with the waiting count from `getQueue({ status: "pending" })`; `Admin` (admin+); `System` (sysadmin); then `Sign in` or the display name linking to `/people/:id` plus a `Sign out` button. Banner reads `Showing the archive snapshot of <takenAt as "14 September 2026">` using `toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })`. Header must wrap cleanly at 375 px.
- `SignIn` / `Join`: archive-styled forms; `Join` fields display name, email, password, checkbox `Show my email on my profile` (unchecked); both call `signIn(token)` then navigate to `?next=` or `/`; server error text shown inline.

- [ ] **Step 1: Write the failing test** `frontend/src/archive/account.test.js`

```js
import { atLeast } from "./account";

test("atLeast follows the four-role ladder", () => {
  expect(atLeast("sysadmin", "admin")).toBe(true);
  expect(atLeast("moderator", "admin")).toBe(false);
  expect(atLeast(undefined, "contributor")).toBe(true);
});
```

- [ ] **Step 2: Run `CI=true npx react-scripts test --watchAll=false src/archive`** — Expected: FAIL, cannot resolve `./account`.
- [ ] **Step 3: Implement the files above; delete `frontend/src/Auth/`.**
- [ ] **Step 4: Run the frontend tests and `npm run build`** — Expected: tests pass, build compiles with no warnings. Manually: join, sign out, sign in, header changes, `/login` redirects.
- [ ] **Step 5: Commit** — `feat: archive sign in, join and account-aware header`

---

### Task 11: Contribute page

**Files:**
- Create: `frontend/src/archive/ContributionForm.js`, `frontend/src/archive/ContributionForm.test.js`, `frontend/src/archive/Contribute.js`
- Modify: `frontend/src/archive/archive.css`

**Interfaces:**
- Consumes: `useAccount`, `submit`, `getWorks({ limit: 200 })`, `getAuthors()`, `matches` from `search.js`.
- Produces (`ContributionForm.js`): `formErrors(type, values, targetKind) -> string[]` (client mirror of the server limits, for instant feedback); default export `ContributionForm({ type, targetKind, current, initial, onSubmit, submitLabel })` — renders the fields for `note` (English textarea + Urdu textarea `dir="rtl" lang="ur"`), `citation` (source, link, comment), `correction` (field select from the allow-list for `targetKind`, current value read-only from `current[field]`, new value, reason), `add_keywords` (English and Urdu keyword textareas, one per line), `new_work` (title, author, year, genre, language, magazine, English and Urdu descriptions, keywords; no file field). Profile editing (Task 12) reuses it with `initial`.
- `Contribute.js`: signed out → explanation plus `Sign in` / `Join` links carrying `?next=/contribute...`; signed in without display name → the no-display-name copy linking to the profile settings; otherwise step 1 cards `An existing work` / `An author` / `A new work`, a searchable list for the first two (duplicate titles disabled with the picker copy, computed client-side by counting trimmed lowercase keys), step 2 type choice and `ContributionForm`; `?work=<slug>` / `?author=<slug>` preselect; success state shows the submit-success copy and a link to `/people/<id>`.

- [ ] **Step 1: Write the failing test** `frontend/src/archive/ContributionForm.test.js`

```js
import { formErrors } from "./ContributionForm";

test("client validation mirrors the server limits", () => {
  expect(formErrors("note", {}, "work").length).toBeGreaterThan(0);
  expect(formErrors("note", { bodyUrdu: "یاد" }, "work")).toEqual([]);
  expect(formErrors("citation", { source: "S", url: "javascript:x" }, "work").length).toBeGreaterThan(0);
  expect(formErrors("correction", { field: "bio", value: "v" }, "author").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the frontend tests** — Expected: FAIL, cannot resolve `./ContributionForm`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests and build; manual check** each of the five forms submits against the running backend, Urdu text right-aligned, duplicate entries disabled, 375 px layout.
- [ ] **Step 5: Commit** — `feat: contribute page for works, authors and new works`

---

### Task 12: Contributions on work and author pages; profile page

**Files:**
- Create: `frontend/src/archive/ContributionItem.js`, `frontend/src/archive/Profile.js`
- Modify: `frontend/src/archive/Work.js`, `frontend/src/archive/Author.js`, `frontend/src/archive/archive.css`

**Interfaces:**
- Consumes: `getPerson`, `getPersonFull`, `updateMe`, `editSubmission`, `withdrawSubmission`, `setRole`, `disableUser`, `enableUser`, `deleteUser`, `useAccount`, `atLeast`, `ContributionForm`.
- Produces (`ContributionItem.js`): default `ContributionItem({ item, showContributor = true })` — note: English paragraph and/or Urdu paragraph (`dir="rtl" lang="ur"`); citation: source, optional link (`rel="nofollow noopener ugc"`, `target="_blank"`), optional comment; footer: contributor display name linking to `/people/:id` (or `Deleted user`) and the approval date. Named `ContributionsSection({ items, contributeHref, label })` — heading `Contributions`, the list, an empty state `No contributions yet.`, and the link `Contribute to this <label>`.
- `Work.js`: render `ContributionsSection` below the description block (the element that shows `work.engInfo` / `work.urduInfo`), `contributeHref="/contribute?work=<slug>"`, `label="work"`. `Author.js`: below the biography, `?author=<slug>`, `label="author"`.
- `Profile.js` (`/people/:id`): public view groups approved contributions by `target.label` with links to `/works/<slug>` or `/authors/<slug>` (plain text when `slug` is null); shows email when present. Owner (or admin+) loads `getPersonFull`: sections `Waiting for review`, `Changes requested` (reason + Edit opens `ContributionForm` with `initial`), `Rejected` (reason), `Withdrawn`; Edit / Withdraw on pending and changes-requested items. Owner settings: display name input and show-email checkbox calling `updateMe`. Admin+: role select offering only roles below the viewer's rank, Disable / Enable, and for sysadmin Delete (with `window.confirm`), plus the `log` list (time, actor, action, reason).

- [ ] **Step 1: Implement** (no new pure logic; verification is by build and browser).
- [ ] **Step 2: Run `npm run build`** — Expected: compiles with no warnings.
- [ ] **Step 3: Manual check** against the running backend: approved citation shows on the work page; contributor link opens the profile; owner sees pending item with Edit / Withdraw; another contributor sees only approved items; admin view shows the log and role controls; both themes; 375 px.
- [ ] **Step 4: Commit** — `feat: contributions on work and author pages; contributor profiles`

---

### Task 13: Review queue

**Files:**
- Create: `frontend/src/archive/Review.js`
- Modify: `frontend/src/archive/archive.css`

**Interfaces:**
- Consumes: `getQueue`, `getSubmission`, `getPreview`, `getHistory`, `decide`, `ContributionItem`, `useAccount`, `atLeast`.
- `Review.js` (`/review`, moderator+, otherwise `You need to be a moderator to see this page.`): left pane tabs `Waiting` (`pending`, oldest first), `Changes requested`, `Decided` (`approved`, `rejected`, `withdrawn`, `retracted`; newest first); rows show type label, target, contributor display name and age (`3 days ago`). Right pane for the selected item: note / citation via `ContributionItem` with `showContributor={false}`; correction as two columns `Current` / `Proposed` with a warning when `changedSinceSubmit`; keywords and new works from the preview plan (matched, new to archive, already on work, duplicate warnings) with an override input per new keyword feeding `keywordOverrides`; history list. Actions `Approve`, `Request changes`, `Reject`; one reason textarea, required (buttons disabled while empty) for the last two. After a successful decision the next waiting item opens. Server errors (offline, already decided, self-review) appear above the actions. Panes stack under 900 px.

- [ ] **Step 1: Implement** (no new pure logic).
- [ ] **Step 2: Run `npm run build`** — Expected: compiles with no warnings.
- [ ] **Step 3: Manual check:** approve a note (appears on the work page), reject with a reason (shows on the contributor's profile), request changes then edit as the contributor (returns to Waiting), approve a correction with Neo4j off (offline message, item stays), keyword override, header count updates.
- [ ] **Step 4: Commit** — `feat: moderator review queue`

---

### Task 14: Admin and System pages

**Files:**
- Create: `frontend/src/archive/Admin.js`, `frontend/src/archive/System.js`
- Modify: `frontend/src/archive/archive.css`

**Interfaces:**
- Consumes: `getUsers`, `setRole`, `disableUser`, `enableUser`, `deleteUser`, `getAudit`, `getSystem`, `reloadArchive`, `useAccount`, `atLeast`, `matches`.
- `Admin.js` (`/admin`, admin+): tabs `People` and `Activity`. People: search box (display name or email), table of display name (links to profile), email, role select (options strictly below the viewer's rank; disabled for rows at or above it), Disable / Enable, Delete for sysadmin, pending and approved counts. Activity: newest first, `Load more` using `before` = last id; each row shows time, actor, action in plain words (`approved a note`, `changed role to moderator`), target, reason.
- `System.js` (`/system`, sysadmin): archive source (live or snapshot with the error), loaded-at and snapshot date, counts, SQLite path and size, upload folder, live snapshot path and whether it exists, `Reload archive` button showing the new meta, and a link `Open the NeoViz query tool` to `/configuration`.

- [ ] **Step 1: Implement** (no new pure logic).
- [ ] **Step 2: Run `npm run build`** — Expected: compiles with no warnings.
- [ ] **Step 3: Manual check:** admin promotes a contributor to moderator and cannot pick admin; sysadmin can; disable blocks sign-in; activity shows each action; reload updates counts; both themes; 375 px.
- [ ] **Step 4: Commit** — `feat: admin people and activity pages; sysadmin system page`

---

### Task 15: Settings, deploy notes, docs, final verification

**Files:**
- Modify: `backend/.env.example`, `CLAUDE.md`
- Create: `docs/deploy-mac-mini.md`

- [ ] **Step 1:** `.env.example` gains `SYSADMIN_EMAILS=`, `ADMIN_EMAILS=`, `TRUST_PROXY=`, `ARCHIVE_LIVE_SNAPSHOT=`, each with a one-line `#` explanation (settings file, not code).
- [ ] **Step 2:** `docs/deploy-mac-mini.md`: data folder outside the repo (`DB_FILE`, `UPLOAD_DIR`, `ARCHIVE_LIVE_SNAPSHOT` under `~/bayaaz-data/`), `SERVE_FRONTEND=true`, rotate `JWT_SECRET` on first deploy, nightly launchd backup running `sqlite3 "$DB_FILE" ".backup '<dir>/archive-$(date +%F).db'"` keeping 14 days plus copying uploads, the campus 7687 caveat with the three options from the spec, Tailscale for team access, and a warning that `ADMIN_EMAILS` / `MODERATOR_EMAILS` re-promote on every restart, so remove an address from the list before demoting that person in the site.
- [ ] **Step 3:** `CLAUDE.md`: replace "Still needed: Frontend for the above" with a short section on roles, the new routes and pages, the activity log, the live snapshot, the duplicate guard, and how to run `npm test`.
- [ ] **Step 4: Full verification** — `cd backend && npm test` (all pass); frontend tests pass; `npm run build` clean; `grep -rnE "^\s*(//|/\*|\*)" backend/*.js backend/test frontend/src/archive` prints nothing.
- [ ] **Step 5: Commit** — `docs: deploy notes, settings and project guide for contributions`
