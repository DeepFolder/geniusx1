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
   docker compose --env-file shared/app.env -f compose.production.yml up -d --wait app
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

Set a Genius X1 `OPENAI_API_KEY` in the server's `shared/app.env`, then recreate
only its app service with the command above. Model access is required too.
Configure SMTP separately before relying on password-reset email. Do not borrow
another app's API keys or signing secrets.

Install `geniusx1-backup`, its service, and timer from this directory. The daily
timer keeps 14 days of database dumps on this VPS. Those dumps do not include the
upload volume and are not an off-server backup. A restore must target a reviewed,
separate database first; do not overwrite live data during a test.
