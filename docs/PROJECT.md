# Genius X1 project record

Updated: 2026-09-14.

## Current status

Unreleased local work adds a modern public homepage at `/`, moves the guest-capable
calculation interface to `/workspace`, and adds application-specific About,
Privacy, Terms, Legal, and Cookie pages. A compact first-visit notice records the
necessary-storage acknowledgement and remains available through “Cookie settings.”
The homepage uses the same header, wordmark, sidebar, and dark-first theme as the
calculation workspace; its restrained centered hero follows the established
DeepFolder visual hierarchy, and its animated ball-screw example renders the real
Genius chat, worksheet, outline, and prompt components rather than a separate mock.
Policy links stay in the footer, and the sidebar exposes a
Home item. The homepage hero reuses the workspace's exact Genius X1 / Engineering
intelligence empty state. Its fixed-ratio animation follows generation through the
real input, equation, and result views without changing the page height or scroll
position. Calculation disclaimers remain in the workspace, Terms, and Legal pages.
`robots.txt`, `sitemap.xml`, canonical, and social metadata are included. This work
is verified locally but is not yet on GitHub or the public VPS.

The homepage and all six public/workspace routes rendered in the local browser.
Consent close/reopen behavior passed, the production build passed, and 27 focused
public-site/sidebar/theme/workspace tests passed. `git diff --check` passed. The same 292 documented
TypeScript errors remain; none point to the new public-site files. The normal test
wrapper refused the older custom local database configuration, so the UI-only
tests were run directly through the installed Vitest executable without database
or provider access.

The current live release is `43a3c6d1bea950f6e6ff31f58fe23fbe276bbf58`, verified
on 14 September. All Replit runtime integration is removed: the external banner,
storage SDK/bucket defaults, domain allowances, reset-link fallback, and old
benchmark destination. Attachments use Genius X1's own private upload volume.
Calculation history waits for sign-in and is cached separately for each owner.

Public HTTP redirects to HTTPS, DNS resolves correctly, and the web ports and
database are healthy. The owner suspects a workplace network restriction; that
has not been independently confirmed. Guest `/api/auth/me` requests still
correctly return 401. These responses do not indicate a port failure.

HTTPS sign-in, authenticated history, save/recalculation/reload/version history,
and a real Standard-mode text-PDF upload/proposal passed on the final release.
The downloaded PDF matched its original bytes. Guest file access and direct
access to stored bytes/metadata were rejected. Only the synthetic verification
calculations and files were removed; the other hosted app retained its image.

The upload check also exposed an existing PDF.js incompatibility with Node
Buffer input. The parser now receives a plain byte-array copy, preserving the
original upload and correctly reading compressed PDF objects. Local builds,
267 initial unit/fixture checks, and 15 final focused checks passed. The final
checks include three new PDF regressions; the same 292 TypeScript errors remain.

The application is live at **https://geniusx1.com**, using its own Docker app,
PostgreSQL database, network, secrets, and uploads on the owner's CloudPanel VPS.
The public browser workspace, HTTPS login, secure cookies, calculation saving,
recalculation, reload, version history, and unauthenticated-access rejection were
verified. A request from the unrelated DeepFolder origin was rejected too.
`www.geniusx1.com` is configured to redirect to the apex domain.

Standard-mode AI generation is configured and verified with a real provider call.
The generated force was 20 N; changing mass from 10 kg to 20 kg recalculated it
to 40 N, and reload retained the result. Version history responded. Only the
verification calculation was deleted afterward. Expert and PhD remain unverified.
The key is in the root-only server file `/opt/geniusx1/shared/app.env`, supplied
to the app container at runtime. Only the Genius X1 app container was recreated.
The initial administrator login is saved privately on this workstation in
`.local/production-login.txt`; `.local/production-ai.env` contains the owner's
private key input. Neither belongs in Git or a source archive.

The local Windows setup remains available at http://localhost:5000 using Node.js
24 and an isolated native PostgreSQL 16 database.

Initial local checks without an AI key:

- The Genius X1 workspace and sign-in page render.
- The approved local admin can sign in.
- Saving a calculation recomputes the arithmetic on the server.
- Editing mass recalculated force from 20 N to 40 N; reload retained the result.
- Version history responds, and unauthenticated document access is rejected.
- AI generation returns an explicit missing-key response.
- Re-running setup preserves the database/account credentials.
- The production bundle starts, serves its frontend/assets, and responds to
  `/api/health` on a separate local port. That temporary server was stopped.
  This initial check was followed by the successful VPS deployment below.

## Setup delivered

Use `npm ci`, `npm run setup`, and `npm run dev` with Node.js 24 and npm 11.
The lock file was verified with clean `npm ci` on Windows and Linux. The VPS's
npm 11 also required 17 missing Tailwind Oxide/Lightning CSS platform records;
those exact versions were restored, leaving every existing package record intact.

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
- Initial VPS production image build and public HTTPS smoke check: passed. Initial app
  commit: `67aabb0c9a0da1738c9dc1e3b1c31c71be1f43fb`. Later commits add deployment
  documentation and the separately installed backup scripts.
- Relevant local suites were rerun for deployment: all 255 passed; the same 292
  TypeScript errors remain. The full suite was not repeated for these changes.
- The separate database was initialized only after confirming zero public
  tables. A unique approved production admin was created. Daily database backups
  are enabled, and an initial compressed backup was created and checked.
- Real Standard-mode AI generation, deterministic recalculation, saved reload,
  and version history passed on public HTTPS after installing the owner's key.
  Private evidence is in `.local/production-ai-evidence.json` on this workstation.
- Expert/PhD modes, scanned-PDF flow, remote storage, and email remain unverified.
  Do not equate passing mocks/builds with those capabilities.
- Main-branch reconciliation: npm 11 accepted the merged lock; the production
  build and 235 unit/fixture tests passed. The same 292 TypeScript errors remain.
  No application dependencies were upgraded, and the VPS was not redeployed.
- A fresh source copy passed an actual clean npm 11 install, native PostgreSQL
  initialization, local administrator creation, and production build. This used
  its own local database on port 55433; existing databases were left untouched.

Use `npm test` for an isolated temporary database, not raw Vitest pointed at
development or production data. Tests/benchmarks outside this wrapper need
separate configuration review.

## Source context

The canonical application branch is `main` in
https://github.com/DeepFolder/geniusx1.git, and GitHub's default branch is `main`.
The reconciled application and deployment setup have been published. Its history
includes the original remote `main`, the complete application export, the remote
setup commit `b602fb3`, and the verified local/VPS setup. The former application
branch was advanced to the same release for existing checkouts. Colleagues can
clone the repository normally or explicitly select `main` using the README.

The merge retains the portable launcher, private local database, and removed
Replit instructions. It includes the remote npm 11 installer policy and Linux
package metadata without upgrading dependencies. The install-script allowlist
also covers the locked native PostgreSQL packages required by fresh setup.
The Windows port fix was already covered by the tested launcher/server setup.
`master` remains the unrelated component-preview starter. Use `main` for new
work; the former application branch is `export/genius-x1-working-app`.
The colleague's release prompt is `docs/CODEX-DEPLOY-PROMPT.md`; GitHub and SSH
access must be provided separately. Publishing source does not redeploy the VPS.
The deployment prompt includes a short instruction a colleague can adopt for
future application-change pushes. `AGENTS.md` requires agents to complete and
verify an authorized release after pushing, while keeping GitHub-only and
documentation-only work separate from a live app update.

Earlier starter edits are preserved in the local Git stash named
"Before importing actual Genius X1 app on 2026-09-13". Old build/dependency folders
are under `.local/starter-build-backup-2026-09-13/`. Do not apply that stash to
this application: its pnpm workspace and schema assumptions are different.

## Remaining work, in order

1. **Codex:** investigate the remaining test failures and TypeScript errors as
   development work; preserve auth and deterministic calculation behavior.
2. **Owner/Codex:** verify Expert/PhD model access and configure this application's
   email when needed, verify scanned-PDF handling, review remaining legacy branding,
   and add off-server backups. The
   current daily backups cover the database on this VPS, not upload files.
3. **Owner:** rotate any old exported signing secret still used elsewhere. This
   deployment already uses newly generated, independent signing secrets.
