# Genius X1 on CloudPanel

Target: **https://geniusx1.com** on the owner's existing CloudPanel VPS.
Genius X1 has a separate Docker Compose project, database, network, secrets, and
upload volume. The other applications on the VPS are outside this deployment.

## Server layout

- `/opt/geniusx1/compose.production.yml`: installed copy of this repository's compose file.
- `/opt/geniusx1/releases/<commit>/`: source for an exact Git commit.
- `/opt/geniusx1/shared/app.env`: root-only production credentials and `APP_IMAGE`.
- `/opt/geniusx1/shared/admin-login.txt`: private initial administrator credentials.
- `/opt/geniusx1/backups/`: compressed database backups.
- Docker names: `geniusx1`, `geniusx1-backend`, `geniusx1-postgres-data`, `geniusx1-uploads`.
- CloudPanel site: `geniusx1.com`, site user `geniusx1`, proxy `http://127.0.0.1:5081`.
- `www.geniusx1.com` redirects to the HTTPS apex domain.

Public visitors use **https://geniusx1.com** without a port suffix. Port 80
redirects to HTTPS on port 443. The Docker proxy port 5081 is intentionally private.
A 401 response from `/api/auth/me` means the visitor needs to sign in; it is not
a port or TLS failure. Guest pages must not fetch private calculation history.

New files use `/app/uploads/.objects` on `geniusx1-uploads`. Data and access
metadata stay together, and this hidden directory must never be served through
`/uploads`. The storage adapter requires no external account or bucket. Database
backups currently exclude this volume; preserve it separately during recovery.

Use the VPS owner's authorized SSH account. Verify the account and server before
writing: the desktop's global Hostinger connection may belong to another person.
Do not copy credentials, data, or configuration from another hosted application.
SSH and API credentials must be supplied privately; Git does not include them.

## Release an update

1. Read `docs/PROJECT.md` and `docs/DEPLOYMENT.md`; review any schema changes.
   Build from a clean, committed application branch and record the full commit.
2. Transfer `git archive` output to a new `/opt/geniusx1/releases/<commit>/` folder.
   Never transfer `.env`, `.local`, local databases, or `node_modules`.
3. Build the runtime image on Linux from that folder:

   ```sh
   docker build --memory=2g --build-arg APP_BUILD_SHA=<commit> \
     --build-arg APP_BUILD_DATE=<UTC-date> -t geniusx1:<commit> .
   ```

4. Run `/usr/local/sbin/geniusx1-backup`. Apply only reviewed migrations when
   needed. Preserve the previous image name for rollback.
5. Update only `APP_IMAGE` in `/opt/geniusx1/shared/app.env`, then run:

   ```sh
   cd /opt/geniusx1
   docker compose --env-file shared/app.env -f compose.production.yml up -d --no-deps --wait --wait-timeout 90 app
   ```

6. Verify `/api/ready`, `/api/build-info`, HTTPS sign-in, calculation save and
   recalculation, and any changed features. Update the project/deployment record.

For rollback, restore the previous `APP_IMAGE` and repeat step 5. Confirm schema
compatibility first. Never delete volumes or use `docker compose down -v` to deploy.

## First database only

Build a setup image with `docker build --target build` and the same release
arguments. Start only `postgres`, then verify it has **zero** public tables before
running Drizzle from the setup image on `geniusx1-backend`, using only this app's
environment file. Do not pass `--force`. Create a unique approved admin in this
database and store its generated credentials privately. This first-run procedure
must never be reused as an automatic migration against an existing database.

## Credentials and backups

Genius X1's own `OPENAI_API_KEY` is configured in the root-only server file
`shared/app.env`. Real Standard-mode generation and saved recalculation passed
on 2026-09-13. Expert and PhD model access remain unverified.

To rotate the key, update only that variable while preserving all other settings,
then recreate the app service to load it:

```sh
cd /opt/geniusx1
docker compose --env-file shared/app.env -f compose.production.yml up -d --no-deps --wait app
```

Never print environment values or include the file in an image/source archive.
Configure SMTP separately before relying on password-reset email. Do not borrow
another app's API keys or signing secrets.

Install `geniusx1-backup`, its service, and timer from this directory. The daily
timer keeps 14 days of database dumps on this VPS. Those dumps do not include the
upload volume and are not an off-server backup. A restore must target a reviewed,
separate database first; do not overwrite live data during a test.
