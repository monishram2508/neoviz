# Contributions, moderation and roles — design

Date: 2026-11-11
Project: Bayaaz-e-Hayaat public archive (`v4/`)

## Intent

Bayaaz-e-Hayaat is a literary archive of Deccan / Hyderabad writing, curated by Prof. Nazia Akhtar. The public site lets anyone browse works and authors. This feature lets registered people add to the archive — context, sources, corrections, keywords, missing works — while keeping the archive trustworthy: nothing a member of the public writes appears until a moderator has approved it, and every decision is on record.

It is an archive, not a social site. No votes, likes, karma or reputation. Contributors are credited by display name; their email is never shown unless they opt in.

Nazia owns the content and will be the admin. She is not technical, so two student maintainers (the developer and a teammate) hold a separate sysadmin role for everything technical.

## Goals

- Anyone can browse every public page without an account. Contributing requires an account.
- Registered users can contribute notes, citations and corrections on works and authors, keywords on works, and entirely new works.
- Every submission starts `pending` and is invisible to the public (and absent from Neo4j) until approved.
- Moderators approve, reject or request changes; reject and request-changes require a reason.
- Approved notes and citations appear on the work or author page, credited and linked to the contributor's profile.
- Approved corrections overwrite the field in Neo4j; the old value is kept in the record.
- Profiles show a person's approved contributions to everyone; the owner also sees their pending / changes-requested / rejected / withdrawn items with reasons.
- An append-only activity log records every submission, edit, withdrawal, decision, role change and account action.
- Four roles: contributor, moderator, admin, sysadmin.

## Non-goals (this round)

- Voting, karma, reputation, comments on contributions.
- Email notifications of decisions (status is shown on the profile; may be added later).
- Password reset and two-factor login.
- Image uploads (author portraits, page scans).
- File uploads from the public new-work form. The copyright question (may contributors upload full texts of in-copyright works?) is Nazia's to settle first. The backend upload support stays for later; the public form has no file field.
- Correcting a work's title or an author's name (they are the keys contributions attach to).
- Correcting genre, magazine or language (genre and magazine are relationships; the site takes a work's language from its author's `language` property, which also has a `USES_LANGUAGE` relationship and a closed set of values). Contributors send these as notes and a moderator applies them by hand.
- Merging duplicate records. Nazia's team decides those; this feature only refuses to act on them (see "Duplicate records").
- Editing an approved contribution (an admin retracts it; the contributor submits again).
- Moving the NeoViz query tool onto the server-side archive connection. This round only locks the tool to sysadmins.
- Urdu keyword search.

## Anti-goals (would make this a failure even if it works)

- An email address shown publicly without the user opting in.
- Pending or rejected content visible on the public site or present in Neo4j.
- Any way, through the app, to edit or delete activity-log entries — including for sysadmins.
- A random registered user able to reach raw Cypher, the Groq-backed NL query, or the archive's Neo4j credentials.

## Constraints

- Stack: React (CRA, react-router v6) + Express + SQLite (`sqlite3`) + Neo4j AuraDB Free. See `v4/CLAUDE.md` for architecture.
- AuraDB Free pauses after 3 days idle; campus wifi blocks port 7687. The public site already falls back to the JSON snapshot (`backend/archiveCache.js`). Anything that must work while Neo4j is unreachable must live in SQLite.
- Hosting is undecided; most likely a lab Mac mini. The SQLite file and uploads must sit outside the repo and be easy to back up.
- Code pushed to `origin` must contain no comments (developer's rule). The local `with-comments` branch is never pushed.
- Keyword normalisation exists in three copies (Python import, frontend `normKey`, `backend/normalize.js`); change them together if touched.
- Default theme is light (already changed in `frontend/src/theme.js`).

## What already exists (build on it, don't replace it)

- `backend/submissions.js` (mounted under `/api`): types `new_work`, `add_keywords`; statuses `pending`, `approved`, `rejected`, `changes_requested`; multer upload to `UPLOAD_DIR` (20 MB, extension allowlist, random names); moderator queue `GET /submissions`; `GET /submissions/:id/preview` builds the exact Cypher plan; `POST /submissions/:id/decide` runs those statements through `archive.writeArchive` (single transaction) with optional `keywordOverrides`.
- `backend/db.js`: `users`, `connections`, `submissions` tables; migration pattern via `PRAGMA table_info` + `ALTER TABLE`; `users.role` (`reader`/`contributor`/`moderator`) seeded from `MODERATOR_EMAILS`.
- `backend/middleware.js`: `authMiddleware` (JWT), `loadRole` (reads role from SQLite on every request), `requireRole(...roles)`.
- `backend/archiveCache.js`: in-memory archive, `load({ force: true })` reloads from Neo4j or snapshot; `publicWork` shape.
- `backend/public.js`: unauthenticated `/api/public/*` (meta, authors, authors/:slug, works, works/:slug, keywords, graph). `/works` caps `limit` at 200.
- Frontend archive pages in `frontend/src/archive/` inside `Layout.js`; fetch helpers in `archive/api.js`; search helpers in `archive/search.js`; `src/api.js` has `apiUrl` and `authHeaders`; JWT lives in `localStorage["token"]`.
- Old NeoViz pages `/configuration`, `/cypherquerytester`, `/import-json` stay as they are (sysadmin only once the API is locked). Old `/login` and `/register` redirect to the new `/signin` and `/join`, because registration now requires a display name; `/system` links to the NeoViz tool.

## Roles and permissions

Stored roles: `contributor` (default), `moderator`, `admin`. Legacy `reader` is treated as `contributor`.

Sysadmin is never stored. The effective role is `sysadmin` when the account's email (trimmed, lowercased) is in `SYSADMIN_EMAILS`, otherwise the stored role. This check happens in `loadRole` on every request, so editing `.env` and restarting grants or removes sysadmin; the API can never set or change it.

Ranks: contributor 0 < moderator 1 < admin 2 < sysadmin 3. Route guards are "at least rank X".

`ADMIN_EMAILS` seeds admins at boot and at registration, exactly as `MODERATOR_EMAILS` seeds moderators today (promote only, never demote).

| Action | Public | Contributor | Moderator | Admin | Sysadmin |
|---|---|---|---|---|---|
| Browse archive, approved contributions, profiles | ✓ | ✓ | ✓ | ✓ | ✓ |
| Submit; edit / withdraw own pending or changes-requested | | ✓ | ✓ | ✓ | ✓ |
| See own full profile (all statuses + reasons) | | ✓ | ✓ | ✓ | ✓ |
| Review queue, preview, decide | | | ✓ (not own) | ✓ | ✓ |
| See who decided an item | | | ✓ | ✓ | ✓ |
| Set role contributor ↔ moderator | | | | ✓ | ✓ |
| Retract an approved note or citation (reason required) | | | | ✓ | ✓ |
| Disable / enable an account | | | | ✓ | ✓ |
| Any user's full profile + their activity log; global activity log | | | | ✓ | ✓ |
| Set role admin / remove admin | | | | | ✓ |
| Delete an account | | | | | ✓ |
| NeoViz tool routes (`/connect`, `/query`, `/nl-query`, `/explain`, `/save-connection`, `/connections`, JSON import) | | | | | ✓ |
| `/system` status + reload archive | | | | | ✓ |

Rules that cover the edge cases:
- You may only change, disable or delete accounts whose effective rank is strictly below yours, and only assign roles strictly below yours.
- Moderators cannot decide their own submissions. Admins and sysadmins can.
- Contributors see the reason for a decision but not who made it.
- A disabled account cannot log in (`"This account is disabled"`), and `loadRole` rejects its existing tokens with 403. Its approved contributions and profile stay public.
- Deleting an account removes the `users` row. Its submissions and log entries keep the numeric id and render as "Deleted user".

## Contribution types

All text is trimmed; limits are enforced server-side with clear 400 messages.

| Type | Target | Payload | On approval |
|---|---|---|---|
| `note` | work or author | `body` (≤ 4000), `bodyUrdu` (≤ 4000); at least one required | SQLite only; shown publicly |
| `citation` | work or author | `source` (required, ≤ 1000), `url` (optional, http/https only, ≤ 500), `comment` (optional, ≤ 2000) | SQLite only; shown publicly |
| `correction` | work or author | `field`, `value`, `reason` (required, ≤ 2000), `before` (captured server-side at submit time) | Neo4j write, then cache reload |
| `add_keywords` | work | existing | existing Neo4j write, then cache reload |
| `new_work` | — | existing (optional file) | existing Neo4j write, then cache reload |

Correctable fields — work: `year` (≤ 20), `engInfo` (≤ 8000), `urduInfo` (≤ 8000); author: `bio` (≤ 8000). The Cypher property name comes from this fixed allowlist, never from request input. The approve preview shows before → after; if the live value no longer equals the captured `before`, it warns "changed since this was submitted".

Urdu text fields render with `dir="rtl" lang="ur"`.

Targets: `submissions.target` holds the Neo4j key exactly as the archive cache has it (work `title`, author `name`); a new `target_kind` column holds `work`, `author`, or NULL for `new_work`. Public lookups match case-insensitively on the trimmed key.

### Duplicate records

The archive has records that share a key: two works titled "Mundadugu" (1945 and 1980, differently named authors) and two authors named "Chalapathi Vijayvardhanam". Work `id` properties cannot replace the key (5 works have none, 3 are duplicated), and slugs depend on load order.

- A target whose key matches more than one node is refused at submit time and again at approve time: "This title matches more than one record in the archive. The archive team needs to resolve the duplicate first."
- In the `/contribute` picker these entries are shown disabled with "Duplicate record — waiting for the archive team".
- The existing `add_keywords` approval gets the same guard. Today it would write the first node's merged keyword list onto both nodes.
- The duplicates list goes to Nazia's team; once merged, the guard stops firing on its own.

Graph writes record the contributor as `user:<id>` (`contributedBy`, `lastContributionBy`) instead of their email. Existing approve statements change accordingly.

## Status lifecycle

```
pending ──approve──▶ approved ──retract (admin+, note/citation only)──▶ retracted
   │  ▲
   │  └──edit (owner)── changes_requested ◀──request changes── pending
   ├──reject──▶ rejected
   └──withdraw (owner)──▶ withdrawn          (withdraw also allowed from changes_requested)
```

- Editing a `pending` or `changes_requested` item replaces its payload, sets it to `pending`, and logs the previous payload.
- Decide uses a conditional update (`... WHERE id = ? AND status = 'pending'`) so two moderators cannot both decide the same item; the loser gets 409.
- Note / citation approval never touches Neo4j and works while Neo4j is unreachable.
- Correction / keywords / new-work approval writes Neo4j first; if Neo4j is unreachable the item stays `pending` and the moderator sees "The archive database is offline — try again later." After a successful write, the server reloads the archive cache (`load({ force: true })`) so the public site reflects it immediately. Reload failure is logged but does not undo the approval.

### Keeping the fallback current

Today the fallback is a JSON file frozen on 14 September, and `Layout.js` hardcodes that date in the banner. If Neo4j is unreachable after a restart, every approved Neo4j change would vanish from the public site.

- After every successful load from Neo4j (startup and post-approval reloads), the server writes the loaded data to a live snapshot file, `ARCHIVE_LIVE_SNAPSHOT` (default: next to `DB_FILE`). Write to a temporary file, then rename, so a crash never leaves a half-written file.
- When Neo4j is unreachable, the server loads the live snapshot if it exists, else the 14 September backup (`ARCHIVE_SNAPSHOT`, unchanged and never overwritten).
- The banner date comes from the snapshot's `takenAt` (exposed through `/api/public/meta`) instead of being hardcoded.

## Activity log

New table `audit_log`: `id`, `at` (default `CURRENT_TIMESTAMP`), `actor_id` (NULL = system), `action`, `submission_id`, `subject_user_id`, `reason`, `details` (JSON).

Actions: `submission.created`, `submission.edited` (details: previous payload), `submission.withdrawn`, `submission.approved`, `submission.rejected`, `submission.changes_requested`, `submission.retracted`, `user.registered`, `user.profile_changed` (display name from/to, show-email from/to), `user.role_changed` (from/to), `user.disabled`, `user.enabled`, `user.deleted` (display name at deletion, no email), `archive.reloaded`.

One helper writes entries; no route updates or deletes them. Each entry is written immediately after the change it records succeeds; if the log write fails, the request returns 500 and the error is printed to the server console. (A shared `sqlite3` connection cannot isolate one request's transaction from another's, so true atomicity is not attempted.) The existing `moderator_id`, `moderator_note`, `decided_at` columns keep holding the latest decision for quick display; the log is the history.

## Data model changes (SQLite, via the existing migration pattern)

- `users`: add `display_name TEXT`, `show_email INTEGER NOT NULL DEFAULT 0`, `disabled_at DATETIME`.
- `submissions`: add `target_kind TEXT`, `updated_at DATETIME`. New types and statuses as above.
- New `audit_log` table with indexes on `submission_id`, `subject_user_id`, `actor_id`.
- `PRAGMA journal_mode = WAL` at startup.

Existing accounts have no display name; they must set one before submitting.

## API

Public (no auth), under `/api/public`:
- `GET /works/:slug` and `GET /authors/:slug` gain `contributions`: approved notes and citations for that target, oldest first. Each item: `id`, `type`, `body`, `bodyUrdu`, `source`, `url`, `comment`, `approvedAt`, `contributor: { id, displayName } | null`.
- `GET /people/:id`: `id`, `displayName`, `email` only if `show_email`, and approved contributions of every type, each with its target resolved to `{ kind, label, slug }` through the cache (slug null if the target no longer resolves).

Authenticated, under `/api`:
- `GET /me` → `id`, `email`, `displayName`, `showEmail`, effective `role`. The Neo4j credential fields are dropped: no frontend code reads them.
- `PATCH /me` → `displayName` (2–40 chars), `showEmail`.
- `POST /submissions` (existing; new types; requires a display name; max 20 pending per user).
- `PATCH /submissions/:id`, `POST /submissions/:id/withdraw` — owner only.
- `GET /submissions/:id/history` — owner (decider identity removed) or moderator+.
- `GET /submissions?status=&type=` — moderator+, includes contributor display name.
- `POST /submissions/:id/decide` — existing; `note` required when rejecting or requesting changes.
- `POST /submissions/:id/retract` — admin+, approved note/citation, reason required.
- `GET /people/:id/full` — owner or admin+; all submissions with reasons; admin+ also gets that user's activity log.
- `GET /users`, `POST /users/:id/role`, `POST /users/:id/disable`, `POST /users/:id/enable` — admin+, rank rules apply.
- `DELETE /users/:id` — sysadmin.
- `GET /audit?before=&limit=` — admin+, newest first, paged.
- `GET /system`, `POST /system/reload` — sysadmin.

Auth hardening, needed because sign-up becomes public:
- Register requires email (basic format check), password (≥ 8), display name; `show_email` optional. Emails are trimmed and lowercased on register and login; login matches `lower(email)`. The migration logs a warning if existing accounts differ only by email case.
- Login returns one generic error ("Wrong email or password") instead of separate not-found / wrong-password messages.
- JWTs expire after 7 days. Tokens issued before this change have no expiry; rotating `JWT_SECRET` on deploy invalidates them.
- Rate limits with `express-rate-limit` (new dependency): login and register 10 per 15 min per IP; submission create 30 per hour per user. A `TRUST_PROXY` setting enables `app.set("trust proxy", ...)` when served behind a tunnel or proxy.

## Frontend

New archive routes inside `Layout`: `/signin`, `/join`, `/contribute`, `/people/:id`, `/review`, `/admin`, `/system`. All styled from `archive/archive.css` tokens and working at phone width.

- **Header**: Contribute (always visible); Sign in, or the display name linking to the profile with a Sign out option; Review with a pending count for moderator+; Admin for admin+; System for sysadmin.
- **Account state**: one hook / context in the archive that loads `GET /api/me` when a token exists; signing out clears `localStorage["token"]`.
- **`/signin`, `/join`**: archive-styled, return to `?next=` after success. `/join` asks for display name, email, password, and a "Show my email on my profile" checkbox (off by default).
- **`/contribute`**:
  - Signed out: explains contributing needs an account, with Sign in / Join links. No missing display name: prompt to set one.
  - Step 1: choose "An existing work" (searchable list of every work, using `archive/search.js`), "An author" (searchable list), or "A new work".
  - Step 2: for a work — note, citation, correction, keywords; for an author — note, citation, correction; for a new work — a form for the existing new-work fields (no file field).
  - Correction form shows the current value read-only beside the new value.
  - `?work=<slug>` / `?author=<slug>` preselect step 1.
  - On submit: "Thanks — this is waiting for review" and a link to the profile.
- **Work and author pages**: a "Contributions" section under the description listing approved notes and citations (shared display component), each with the contributor's display name linked to their profile and the approval date; one "Contribute to this work / author" link to `/contribute?...`. Citation links open with `rel="nofollow noopener ugc"`.
- **`/people/:id`**: everyone sees display name, email if opted in, and approved contributions grouped by work / author. The owner additionally sees sections for pending, changes requested (with reason, edit and resubmit), rejected (with reason), withdrawn; can edit or withdraw pending items; and has a small settings form for display name and show-email. Admin+ additionally sees the user's activity log and role / disable controls (rank rules apply); sysadmins also see Delete.
- **`/review`** (moderator+): two panes. Left: list with tabs Waiting, Changes requested, Decided; oldest first; each row shows type, target, contributor, age. Right: the selected item — notes and citations rendered exactly as they would appear publicly; corrections as current value vs proposed value; keywords and new works using the existing preview plan (matched vs new keywords, duplicate warnings, keyword override inputs); the item's history. Actions: Approve, Request changes, Reject, with a reason box required for the last two. After a decision the next waiting item opens. On phone width the panes stack.
- **`/admin`** (admin+): Users table (search, display name, email, role control limited by rank, disable / enable, delete for sysadmin, counts) and the Activity log (paged, newest first).
- **`/system`** (sysadmin): archive source (live Neo4j or snapshot, with the error if snapshot), loaded-at time, counts, SQLite file path and size, upload folder path, Reload archive button.

User-supplied text is always rendered as plain text (no HTML, no markdown).

## Hosting notes (Mac mini, likely)

- Set `DB_FILE` and `UPLOAD_DIR` to a folder outside the repo (e.g. `~/bayaaz-data/archive.db`, `~/bayaaz-data/uploads`) so `git pull` and redeploys never touch data.
- Nightly backup via launchd: `sqlite3 "$DB_FILE" ".backup '<backup dir>/archive-<date>.db'"`, keep 14 days, and copy the uploads folder.
- New settings in `.env.example`: `SYSADMIN_EMAILS`, `ADMIN_EMAILS`, `TRUST_PROXY`, and (for email verification, later) `PUBLIC_URL` and the provider key.
- Write these notes into the repo docs (deploy section) and update `v4/CLAUDE.md`.
- If the site ever moves to a host with a disposable disk, the SQLite file needs a persistent volume.

## Email verification — designed, NOT to be built until the developer says so

- `users.email_verified INTEGER NOT NULL DEFAULT 0`; table `email_tokens` (`user_id`, `token_hash` SHA-256, `expires_at` 24 h, `used_at`, `created_at`).
- On sign-up, send a one-time link to `PUBLIC_URL/verify?token=…`. Unverified users can sign in and browse; submitting requires a verified email. Resend button, at most once per minute. Sysadmins can mark an account verified.
- Existing accounts are marked verified in the migration.
- Sending uses the provider's HTTPS API (port 443 — campus blocks SMTP-like ports). Recommended provider: Brevo (free, no domain needed; may land in spam without a domain); Resend if a domain becomes available. With no provider configured, the server prints the link to its console so testing works.
- Until this is built, there is no verification gate.

## Testing

- Backend: Node's built-in runner (`node --test`), wired to `npm test`. No new test dependency.
  - Unit: rank / permission helpers (including the "strictly below" rules and env-derived sysadmin), the status transition table, each type's payload validation, public user shaping (email hidden unless opted in), correction field allowlist.
  - Integration: the app against a temporary `DB_FILE` with `ARCHIVE_NEO4J_URI` empty (snapshot mode). Cover: register / login, submit a note, a contributor cannot decide, reject without reason → 400, approve note → appears on the public work endpoint, retract → disappears, admin cannot grant admin, sysadmin derived from env, disabled account's token rejected, tool routes refused for non-sysadmins, pending cap.
  - This needs the Express app exported separately from `app.listen` in `index.js`.
- Frontend: Jest for pure helpers; manual browser check of each new page in light and dark themes and at phone width.
- Target ≥ 80% coverage on new backend modules.

## Build order

1. Schema migrations, roles and ranks, `SYSADMIN_EMAILS` / `ADMIN_EMAILS`, audit-log helper, auth hardening, tool-route lockdown, rate limits — with tests.
2. Submission types, validation, edit / withdraw / retract, decide changes, cache reload, public contributions, profile, users, audit and system endpoints — with tests.
3. Frontend account state, header, `/signin`, `/join`, `/contribute`.
4. Profile page; contributions on work and author pages.
5. `/review`, `/admin`, `/system`.
6. `.env.example`, deploy notes, `v4/CLAUDE.md`.

## Decisions made by the designer (developer to check)

- Notes and citations live in SQLite, not Neo4j, so they survive Neo4j pauses and use none of the free-tier quota.
- Corrections are limited to work year / English description / Urdu description and author bio. Genre, magazine and language come in as notes.
- Targets that match more than one record are refused until Nazia's team merges the duplicates; this also fixes the existing keyword-approval overwrite.
- After each live Neo4j load the server saves a fresh fallback snapshot, so a Neo4j outage shows the latest approved state rather than 14 September.
- The public new-work form has no file upload until Nazia settles the copyright question.
- Old `/login` and `/register` redirect to `/signin` and `/join`.
- Only notes and citations can be retracted. An applied correction is not reversed automatically; the log keeps the old value for a manual restore.
- Admins manage moderators; only sysadmins manage admins.
- Moderators cannot decide their own submissions; admins and sysadmins can.
- Contributors see the reason for a decision, not who made it.
- Disabled accounts keep their public profile and approved contributions.
- Graph writes credit `user:<id>` instead of an email.
- Rate limiting uses `express-rate-limit` rather than hand-rolled code.
- The contribute page lists works through `/api/public/works?limit=200`; if the archive grows past 200 works the picker needs paging or a dedicated list endpoint.
