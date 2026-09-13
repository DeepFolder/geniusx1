# Genius X1 project record

Updated: 2026-09-13.

## Current status

The actual application runs locally at http://localhost:5000 on Windows x64,
using Node.js 24 and an isolated native PostgreSQL 16 database. The browser was
verified and signed in using the generated local account.

Verified without an AI key:

- The Genius X1 workspace and sign-in page render.
- The approved local admin can sign in.
- Saving a calculation recomputes the arithmetic on the server.
- Editing mass recalculated force from 20 N to 40 N; reload retained the result.
- Version history responds, and unauthenticated document access is rejected.
- AI generation returns an explicit missing-key response.
- Re-running setup preserves the database/account credentials.
- The production bundle starts, serves its frontend/assets, and responds to
  `/api/health` on a separate local port. That temporary server was stopped.
  This did not test production HTTPS sign-in or constitute public deployment.

## Setup delivered

Use `npm ci`, `npm run setup`, and `npm run dev` with Node.js 24.
The final lock file was verified with a clean `npm ci`.

The lock file contained Replit-only download addresses and omitted native
Windows build packages. Those were repaired without changing the versions of
existing retained dependencies. Replit development plugins, vendor instructions,
configuration, and the automatic schema-push hook were removed. Used runtime
storage integrations remain.

The setup script creates random database/signing secrets in `.env`, stores its
database in `.local/postgres`, and writes local account details to
`.local/login.txt`. Nothing in those local paths belongs in Git.
The native database starts with the development server and keeps its data on stop.
Docker remains an optional setup path; it was not verified here because Docker
Desktop failed while initializing its own inference-manager socket.

The app tolerates missing AI credentials through lazy SDK initialization.
Generation endpoints return a configuration error, and local startup indexing/
backfill is disabled. Saved-work arithmetic still uses the real evaluator.

## Verification record

- Clean dependency installation: passed.
- Local initial setup, repeated setup, restart, browser sign-in, and calculation
  save/recalculate/reload/version checks: passed.
- Production build and local production static/API startup check: passed.
- Unit and fixture smoke suites: 28 files, 255 tests passed.
- Full default suite: 455 passed, 4 failed. The failures are three legacy
  topic-restriction assertions and one Genius job-concurrency test timeout.
  The topic tests omit authentication although their endpoint requires it.
  The concurrency timeout needs investigation; do not claim it was fixed.
- TypeScript check: 292 errors both before and after these setup changes. The
  imported source includes duplicate storage methods, legacy missing exports,
  query/result typing issues, and an old default compiler target. No broad
  TypeScript cleanup was attempted.
- Build warnings remain for duplicate legacy storage methods and bundle size.
- No real AI call, scanned-PDF flow, remote storage, email, or public deployment
  was verified. Do not equate passing mocks/builds with those capabilities.

Use `npm test` for an isolated temporary database, not raw Vitest pointed at
development or production data. Tests/benchmarks outside this wrapper need
separate configuration review.

## Source context

The application branch is `export/genius-x1-working-app` in
https://github.com/DeepFolder/geniusx1.git. The initial `master` checkout was only
a component-preview starter. The histories were not merged, and the repository's
default branch was not changed. Colleagues must select the application branch;
the README gives the exact clone command.

Earlier starter edits are preserved in the local Git stash named
"Before importing actual Genius X1 app on 2026-09-13". Old build/dependency folders
are under `.local/starter-build-backup-2026-09-13/`. Do not apply that stash to
this application: its pnpm workspace and schema assumptions are different.

## Remaining work, in order

1. **Owner:** add an authorized `OPENAI_API_KEY` to `.env`. **Codex:** restart and
   verify a real proposal/calculation with the account's available models.
2. **Codex:** investigate the remaining test failures and TypeScript errors as
   development work; preserve auth and deterministic calculation behavior.
3. **Owner/Codex:** choose hosting when deployment is requested, rotate any old
   exported signing secret still in use, and configure database/storage/email.
4. **Codex:** follow `DEPLOYMENT.md`, verify the public service, and record the
   actual hosting/release details. No live deployment is claimed now.
