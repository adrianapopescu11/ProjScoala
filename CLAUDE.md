# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**EduFlow** (internal name `ProjScoala`) — a server-rendered school curriculum + testing site. Anyone can browse subjects, read markdown/LaTeX lessons, take timed tests, and review attempts. Auth has been intentionally removed for now — see "Auth (temporarily removed)" below.

## Commands

- `npm start` — run the Express server (`server.js`) on `PORT` (default 3000).
- `npm run dev` — runs `vite build --watch` and `node --watch server.js` concurrently. Use during development; Vite rebuilds the client test-taking bundle into `public/test.js` while the server auto-restarts.
- `npm run build` — Vite build only (produces `public/test.js`).
- `npm run db:seed` — runs `db/init.js`, which inserts the default Math/Physics subjects + materials if no subjects exist. Idempotent.

No test suite, lint, or typecheck is configured.

## Environment

Required env vars (see `.env.example`):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — used by `db/database.js`. The service role key is used directly; all access goes through the Express layer.
- `ADMIN_USER`, `ADMIN_PASS` — hardcoded credentials for `/admin*` HTTP Basic auth (default `admin` / `admin123`).

The DB schema is **not** auto-applied. Run `supabase/schema.sql` manually in the Supabase SQL editor before `npm run db:seed`.

## Architecture

### Stack
Express 4 + Supabase (Postgres). **No frontend framework, no templating engine** — HTML is built from tagged template literals in `lib/render.js`. Vite is used only to bundle one client-side IIFE (`src/test.js` → `public/test.js`) that handles the test-taking timer, submit guard, and grid-cell keyboard navigation.

### Request flow
`server.js` mounts an HTTP Basic auth gate on `/admin*` (credentials from `ADMIN_USER` / `ADMIN_PASS`), then mounts `routes/curriculum.js` and `routes/tests.js`. After them come a 500 handler and a 404 handler, both of which render via `lib/render.js#page`. No other middleware gates any route — student-facing pages are fully open.

There are **no `/admin` routes mounted yet**, even though the Basic-auth gate is in place and `lib/render.js` exports an `adminPage`/`adminLayout`. When you add admin routes, mount them in `server.js` and use `adminPage(...)` for layout. Anything under `/admin` will be Basic-auth–challenged automatically.

### Auth (temporarily removed)
The previous login/logout flow (cookie-session + bcrypt + `routes/auth.js` + `users.password_hash`) was removed. What remains:
- `users` table is **gone** from `supabase/schema.sql`.
- `test_attempts.user_id` is **gone** — attempts are anonymous.
- `/admin*` is gated by stateless HTTP Basic auth in `server.js`.
- No `req.session.user` anywhere; `page()` / `adminPage()` no longer take a `user` argument.

If you re-introduce auth, you'll need to: add `cookie-session` back, restore `users` table + `password_hash`, restore `requireAuth` middleware on curriculum/tests routes, restore `user_id` on `test_attempts`, and update `page()` to take a user argument again. The Basic-auth gate can stay as a separate concern or be replaced.

### Rendering
`lib/render.js` exports:
- `page(title, content, opts)` — public layout with sidebar nav (Home, Subjects, Attempts, Admin Dashboard). Loads marked + KaTeX from CDN; auto-renders `$…$` and `$$…$$` math on every page.
- `adminPage(title, content, opts)` — admin layout (loads `/admin.css` additionally, supports `flash` and `activePath` for active nav highlighting).
- `escHtml(str)` — **always use this for any user-supplied or DB-supplied string** interpolated into template literals. There is no auto-escaping.
- `opts.extraScripts` — array of script URLs appended at the end of `<body>` (e.g. `'/test.js'`, `'/math-toolbar.js'`).

### Editable text / site settings
Every visible string on the site (site name, logo, nav labels, page headings, button labels, pass/fail verdicts, 404/500 copy, etc.) is sourced from `lib/settings.js`. Defaults live in the `DEFAULTS` map there; admin overrides are stored as `(key, value)` rows in the `site_settings` Postgres table and managed at `/admin/settings`.

To make a new string editable: add a row to `DEFAULTS` in `lib/settings.js` (with `group`, `label`, `default`) and replace the hardcoded text in the route/template with `settings.get('your_key')`. It will automatically appear on the admin settings page grouped under the chosen heading. Blank input on the admin form = use default (the row is deleted).

The settings cache is in-process with a 30s TTL, primed by middleware in `server.js`. The POST handler busts the cache so admins see their own changes immediately; other warm instances pick them up within 30s.

### Database access pattern
Every route imports `supabase` from `db/database.js` and uses a local helper:
```js
const sb = async (query) => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};
```
Routes are wrapped in `const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);` so thrown errors fall through to the 500 handler. Keep this idiom when adding routes — don't introduce a separate ORM/query layer.

### Test-taking flow
`GET /tests/:id` (intro, in `curriculum.js`) → `GET /tests/:id/take` (creates a fresh attempt row, renders the form) → `POST /tests/:id/submit` → `GET /tests/:id/result/:aid`. Supports `multiple_choice`, `short_answer`, and `grid` question types, with a timer driven by `src/test.js`.

Each visit to `/tests/:id/take` inserts a new attempt — without a logged-in user there is no per-user "in-progress reuse." Refreshing the take page therefore creates duplicate attempt rows; submitted attempts are kept, in-progress ones are harmless orphans.

### Question types
Stored in `questions.type` (CHECK constraint: `multiple_choice | short_answer | grid`). For `grid` questions, `question_text` is **a JSON blob** of `{ prompt, rows, cols, row_headers, col_headers, locked_cells: [[r,c],…], correct: [[…],[…]] }`. Grid answers are submitted as per-cell form fields named `grid_<qid>_<r>_<c>`, stored back as a JSON object `{ "r_c": value }` in `attempt_answers.answer_given`, and scored proportionally per cell (partial credit). See `renderGridInputs`, `renderGridResult`, and the grid branch of `POST /tests/:id/submit` in `routes/tests.js`.

Short-answer grading is exact-match, case-insensitive, trimmed, against `answers` rows where `is_correct = 1`.

### Schema
`supabase/schema.sql` is canonical. Tables: `subjects`, `materials` (type ∈ lesson/note/resource, content is markdown), `tests`, `questions`, `answers`, `test_attempts`, `attempt_answers`, `site_settings`. All FKs cascade. `is_correct` and `points_earned` use numeric flags (`SMALLINT 0/1`, `REAL`) rather than booleans.

`subjects.level` is a nullable enum (`'liceu' | 'gimnaziu' | NULL`) used by `/`, `/liceu`, and `/gimnaziu` to group/filter subjects. NULL means the subject only appears in the Home "Other" section. Set via the admin subject form.

If migrating an existing DB from the auth'd schema, run:
```sql
ALTER TABLE test_attempts DROP COLUMN IF EXISTS user_id;
DROP TABLE IF EXISTS users;
```

### Markdown + math
Material `content` is markdown rendered client-side by `marked` with KaTeX auto-render. When editing rendering logic, note the markdown is injected via `JSON.stringify(material.content)` into an inline `<script>` block in `GET /materials/:id` — do not change this to server-side string interpolation without HTML-escaping.

### Deployment
`vercel.json` rewrites all paths to `server.js`. The Express app is exported (`module.exports = app`) so Vercel can wrap it as a serverless function; `app.listen` only runs when invoked as a script (`require.main === module`).
