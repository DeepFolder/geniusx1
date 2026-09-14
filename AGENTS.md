# Genius X1: coding-agent instructions

## First actions

Read `README.md`, `docs/PROJECT.md`, and `docs/DEPLOYMENT.md`. Check Git status
and preserve local changes. Work from `main`; the
repository's `master` branch is an unrelated component-preview starter.

When asked to run the app, do the work:

1. Check `node --version`. Use Node.js 24 and npm 11 with `package-lock.json`.
   When using a bundled desktop runtime, use its Node executable and npm CLI
   consistently. Windows `npm.cmd` can select a different Node installation.
2. On a fresh checkout run `npm ci`, then `npm run setup`. Setup creates native
   PostgreSQL, unique local secrets, and an approved local admin. Existing
   settings/accounts are preserved. Custom databases use the manual README path.
3. Run `npm run dev` in a long-running terminal. It starts the local database and
   hosts UI and API together at **http://localhost:5000**.
4. Verify the public homepage at that URL and the calculation workspace at
   `http://localhost:5000/workspace`. For sign-in use
   `.local/login.txt`. Never invent or hard-code credentials.
5. If no `OPENAI_API_KEY` is configured, still run the app and explain that AI
   generation needs a key in `.env` plus a restart. Never fabricate results or
   claim live AI was tested with mocks.

Do not start the old pnpm workspace or standalone Vite on port 5173.
Do not restore the old starter stash. Subsequent runs need only `npm run dev`
unless dependencies/schema changed. Leave a verified app running when requested.

## Product and source map

Genius X1 turns engineering questions into editable calculation documents with
inputs, assumptions, equations, computed steps, results, charts, and references.
The AI proposes equations; deterministic server-side evaluation performs arithmetic
and dimensional-unit checks. History, versions, comments, and attachments are
scoped to the authenticated owner.

- `client/src/App.tsx`: active routes and authentication gates.
- `client/src/pages/genius.tsx`, `client/src/features/genius/`: main workspace.
- `server/index.ts`: middleware, API/frontend hosting, startup tasks.
- `server/routes/genius.ts`: calculation API and ownership checks.
- `server/services/genius-service.ts`: AI orchestration.
- `server/services/genius-eval.ts`: expression evaluation and unit checks.
- `server/services/genius-settings.ts`: Standard/Expert/PhD model choices.
- `server/services/openai-client.ts`, `server/middleware/require-ai.ts`: lazy AI
  initialization and actionable missing-key responses.
- `shared/schema.ts`, `migrations/`: schemas and historical SQL migrations.
- `server/db.ts`: PostgreSQL connection and retry behavior.
- `scripts/setup-local.mjs`, `scripts/local-database.mjs`, `scripts/run.mjs`:
  portable local setup and startup.
- `scripts/test.mjs`: isolated database test runner.
- `server/objectStorage.ts`, `server/objectAcl.ts`, `server/localObjectStore.ts`:
  local persistent file storage and access control.
- `tests/`: unit, integration, E2E, and benchmark suites.

Legacy DeepFolder company/product/search modules remain in the backend import
graph. Most have no active frontend route. Trace callers before removing them or
describing them as current features. Attachments use this application's own
filesystem, defaulting to `uploads/.objects` and the private Docker upload volume.
Keep that directory off static routes and preserve owner checks and metadata.
Historical database-backed files remain readable. No Replit SDK, script, bucket,
domain allowance, or external upload fallback is used.

## Engineering rules

- Do not use Prettier, `cargo fmt`, or whole-file automatic formatting.
- Analyse proposals critically. Trace imports, callers, data contracts, auth,
  tests, and deployment dependencies before changing code.
- Preserve locked versions unless a change needs an update. Keep download URLs
  public and native dependencies available across platforms.
- Preserve deterministic arithmetic, source checks, and owner isolation.
- Do not restore Replit agent instructions, package restrictions, or the removed
  automatic `db:push --force` hook. Schema changes must be deliberate.
- Keep credentials out of source. `.env`, `.local`, and login files stay private.
  An exported signing secret remains in upstream history; use new secrets.
- Use `npm test` for isolated local tests. Never run tests against production or
  run paid AI benchmarks unintentionally. Generated local settings disable
  startup AI indexing/backfill.
- Run relevant tests, `npm run check`, `npm run build`, and `git diff --check`.
  Report baseline failures honestly; a build is not a clean type check.
- Preserve existing authorization. Do not ask again for authorized local setup,
  fixes, or checks. Publish/provision external services only within user scope.
  When asked to prepare work for a colleague to pull, make reviewed changes
  available on the agreed Git branch.

## Production deployment

The user's chosen domain is **geniusx1.com**. Read `deploy/README.md` and
`docs/DEPLOYMENT.md` before operating the VPS. Use the albertsalicunaj/owner
account; verify account identity before using Hostinger tools. The desktop's
global Hostinger connection can belong to mikelkrasniqi and is not the requested
deployment account.

Genius X1 is independent of the other applications on the same CloudPanel VPS.
Its root is `/opt/geniusx1`, its Docker project/network/volumes start with
`geniusx1`, and its local proxy port is 5081. Do not reuse another app's database,
API keys, signing secrets, domains, volumes, or deployment pipeline.

For a colleague's release handoff, use `docs/CODEX-DEPLOY-PROMPT.md`. Confirm the
remote application branch contains the deployment setup and that this computer
has authorized GitHub/SSH access. A Git push alone does not deploy the app.

## After pushing a release

When deployment is authorized by the current request or the requester's standing
instructions, continue after the Git push until the release is verified live.
Follow `docs/CODEX-DEPLOY-PROMPT.md` and `deploy/README.md`: verify the pushed
commit, build that exact source, back up the database, apply required reviewed
migrations, update `APP_IMAGE`, and recreate only Genius X1's app service.

Check the public build version, database readiness, sign-in, the changed feature,
and calculation save/recalculation/reload. Perform the bounded real AI check when
authorized. Record the deployed commit and results; report GitHub publication
and live deployment separately. If verification fails, follow the documented
rollback procedure. If access is missing, finish independent preparation and
state the exact missing access; do not call the release complete.

The short standing instruction in `docs/CODEX-DEPLOY-PROMPT.md` lets a colleague
explicitly define future application-change push requests to include deployment.
Respect requests limited to GitHub. Documentation-only pushes do not require an
app rebuild; do not create an automatic deployment hook for this workflow.

## Handoff

Update the project record with verified behavior and remaining work. Use short,
plain English: current status, finished work, what remains in order, and the
user's exact next step. Distinguish local runtime, mocked tests, live AI calls,
and public deployment. Do not make the user reread earlier sessions.
