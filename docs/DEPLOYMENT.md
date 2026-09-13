# Deploying Genius X1

The app runs locally on Windows and its production bundle builds. No public
deployment was made here; no hosting account/domain is configured. Live AI and
file-storage portability still need verification.

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
- Storage variables and SMTP values in `.env.example`: configure and verify
  before promising uploads, password resets, or other email-dependent flows.

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

Storage retains Replit object-storage calls and a database fallback. Verify
upload, retrieval, and ownership on the chosen host before enabling uploads.
Scanned PDF processing also needs native PDF rendering tools. These integrations
have not been migrated or verified for another host.

## Release and rollback

1. Resolve or explicitly assess the known check failures in `PROJECT.md`.
2. Provision database/secrets and apply reviewed schema changes.
3. Build, start under the host's process supervisor, and configure HTTPS/origins.
   `/api/health` checks the process, not database/AI/storage readiness.
4. Verify the public workspace, sign-in, real AI calculation, recalculation,
   saving/reload/version history, account isolation, and enabled upload/email flows.
5. Record the provider, domain, deployed commit, migration, restart command, and
   verified checks here.

Keep the previous release and a restorable database backup. Roll back the app only
when compatible with the current schema. Plan database rollback separately.
