# Deploying Genius X1

The production target is **https://geniusx1.com** on the owner's CloudPanel VPS.
Genius X1 uses its own Docker project, PostgreSQL database, secrets, and uploads.
Read [the VPS operations guide](../deploy/README.md) for exact paths, release
commands, backups, and rollback. Standard-mode live AI is verified; Expert/PhD
modes and scanned-PDF processing still need verification.

## Current release

Verified live on 2026-09-14 at **https://geniusx1.com**. The app image is
`geniusx1:2564a627cf45f114a126425a32f941000a820e49`, built from that committed
source and identified by `/api/build-info`. CloudPanel proxies to port 5081 on
loopback and manages the Let's Encrypt certificate for the apex and `www`.
The existing other application on the VPS retained its image. Only the Genius X1
app service was recreated; its database, uploads, credentials, and ports were preserved.

The new public homepage is at `/`; the calculation workspace is at `/workspace`.
About, Privacy, Terms, Legal, and Cookie pages, the animated example, sitemap, and
cookie settings are deployed. Public browser checks covered every new page,
sign-in navigation, guest submission gating, and cookie close/reopen/persistence.
No new browser runtime or Replit/CSP errors appeared. The exact live build and
database readiness passed, followed by secure sign-in, private history, and one
real Standard-mode calculation. Editing mass changed 20 N to 40 N; saved reload
and version history passed. Only that synthetic calculation was deleted.

The source archive SHA-256 is
`0c1723170f3bba92dcf21956e286967bf97ddf5c7a5a00fdbf7b06188b60b0db`.
The image ID is
`sha256:5765b02d4e3f6d70168d2e751456986e5e9f1ce51da4bf251dcc1edf269f51f8`.
The public build timestamp is `2026-09-14T21:50:22Z`. No schema migration or
dependency/configuration change was required. Fresh database and upload backups
passed gzip integrity checks before activation; their paths and the previous
image are recorded inside this release directory. The rollback image is
`geniusx1:43a3c6d1bea950f6e6ff31f58fe23fbe276bbf58`.

The prior release's Replit removal, private persistent file storage, and PDF parser
fix are unchanged. Its real text-PDF proposal/download and access-control checks
remain the latest upload verification; uploads were not retested for this
frontend-only release. Scanned PDFs still need a separate end-to-end check.
Daily scheduled backups still cover only the database and remain on this VPS.

Local and Linux builds passed. The 254 unit checks passed across the main run and
an isolated rerun of a file with two import timeouts under concurrent build load.
The same 292 TypeScript diagnostics remain. The full suite was not rerun; its
previously documented failures remain uninvestigated. See `docs/PROJECT.md` for details.

HTTPS login, secure cookies, saving/recalculation/reload/version history, owner
authentication, and missing-key behavior were tested against the public service.
The verification calculation was deleted afterward. The browser rendered the
actual Genius X1 workspace. Daily database backups are enabled through
`geniusx1-backup.timer`; an initial backup passed its gzip integrity check.

The owner's OpenAI key was installed in the root-only production environment on
2026-09-13, preserving every other setting. Only the Genius X1 app container was
recreated. A real Standard-mode request generated a 20 N force calculation;
editing mass recalculated it to 40 N, which persisted on reload. Version history
responded, and the verification calculation was deleted afterward. Expert/PhD
modes have not been tested with this key.

Email remains unconfigured. Set only this app's credentials in
`/opt/geniusx1/shared/app.env` and recreate its app container. Do not put secrets
in Docker images or Git. The deployed app uses the production launcher and does
not start or seed the native development database.

## Build and runtime

Use Node.js 24. This is one Express service serving both API and React UI.

```sh
npm ci
npm run build
npm start
```

Outputs are `dist/index.js` and `dist/public/`. Keep `package.json`,
`package-lock.json`, `scripts/run.mjs`, installed runtime dependencies, and
required `attached_assets/` and `coming-soon/` content with the release.
The server bundle leaves npm packages external. Install development dependencies
for building; runtime dependencies suffice for an already built release.

The launcher sets production mode across operating systems. It does not start
the native development database in production. Use a managed PostgreSQL service
or another database reachable by the deployment host.

## Environment

Use the host's secret manager or an uncommitted root `.env`. Process variables
take precedence.

- `DATABASE_URL`: PostgreSQL connection; `NEON_DATABASE_URL` is a compatibility
  fallback. Production TLS verifies certificates. Use the provider's CA/connection
  options. `DATABASE_SSL=disable` is only for an intended local/private database;
  do not copy the local default blindly.
- `SESSION_SECRET`, `JWT_SECRET`: separate strong random secrets. Do not reuse
  the signing secret formerly committed in `.replit`. Deletion did not revoke it
  or remove it from history. Rotate it wherever the old value was used.
- `OPENAI_API_KEY`: generation requires access to the models used by
  `server/services/genius-settings.ts`, including Expert/PhD choices.
- `HOST=0.0.0.0`, `PORT`: listener settings required by the host. Generated
  development settings bind to loopback; override them for remote/container use.
- `APP_URL`, `FRONTEND_URL`, `SITE_URL`: the public HTTPS app origin.
- `ENABLE_STARTUP_AI_JOBS=false`: safe initial setting. Review legacy product
  indexing/backfill before enabling these paid-provider background jobs.
- `OBJECT_STORAGE_DIR`: private persistent file directory, default
  `uploads/.objects`; Compose sets `/app/uploads/.objects` inside the uploads
  volume. Do not put it in a publicly served directory. File bytes and access
  policies must be preserved together.
- SMTP values in `.env.example`: configure and verify before relying on
  password resets or other email-dependent flows.

Serve behind HTTPS. Production auth cookies require secure connections, so HTTP
localhost is not a complete production sign-in test. Sessions and some background
job state remain in memory; review that before deploying multiple instances.

## Database, storage, and first admin

`shared/schema.ts` is the current schema. Historical SQL files are incremental
migrations, not a verified complete bootstrap sequence. On a new empty database,
deliberately review and run `npm run db:push`; never use `--force`.
For existing production data, prepare/review a migration and backup, and apply it
separately from deployment. Never push schema automatically after pulling Git.

The local setup admin is restricted to the generated local database. Production
registrations start pending approval. Arrange the initial admin through a reviewed
one-off database operation, then use account approval. Do not expose a public
bootstrap endpoint.

New attachments use the app's local persistent storage, with owner permissions
and content types stored alongside the bytes in a separate metadata tree. Missing
metadata denies access. Upload failures return an error instead of falling back
to publicly accessible database files. Historical database files remain readable;
the VPS had no stored files when this change was prepared. No database migration
is required. External bucket data, if any exists in a different installation,
must be exported with its ownership metadata before switching that installation.
Scanned PDFs also require native PDF rendering tools and separate verification.

## Release and rollback

1. Resolve or explicitly assess the known check failures in `PROJECT.md`.
2. Provision database/secrets and apply reviewed schema changes.
3. Build, start under the host's process supervisor, and configure HTTPS/origins.
   `/api/health` checks the process. `/api/ready` also checks the database; neither
   proves that AI or storage providers are configured.
4. Verify the public workspace, sign-in, real AI calculation, recalculation,
   saving/reload/version history, account isolation, and enabled upload/email flows.
5. Record the provider, domain, deployed commit, migration, restart command, and
   verified checks here.

Keep the previous release and a restorable database backup. Roll back the app only
when compatible with the current schema. Plan database rollback separately.
