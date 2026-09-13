# Genius X1

Genius X1 is an engineering calculation workspace. Describe a problem, review an
AI proposal, and edit a worksheet with inputs, assumptions, equations, results,
charts, and references. The server computes numerical results from expressions.

## First checkout

Use **Node.js 24** and npm. The application is on the branch below; `master`
still contains the unrelated component-preview starter.

```sh
git clone --branch export/genius-x1-working-app https://github.com/DeepFolder/geniusx1.git
cd geniusx1
npm ci
npm run setup
npm run dev
```

Open **http://localhost:5000**. UI and API share this port. Port 5173 and
`/preview/ComponentName` belonged to the old starter.

The commands work in PowerShell as well as macOS/Linux shells. Native database
startup was verified on Windows x64; other platforms were not tested here.
On Linux, run as a normal user, because PostgreSQL cannot run as root.

Setup creates PostgreSQL 16 inside `.local/postgres`, a root `.env` with unique
random signing secrets, and an approved local admin account. Open
`.local/login.txt` for login details. These files are ignored by Git.
Public registrations require admin approval; use the generated account locally.

No Replit account or Docker installation is needed for default setup. The native
database uses [embedded-postgres](https://github.com/leinelissen/embedded-postgres).
For Docker instead, run `npm run setup -- --docker` on a fresh checkout with
Docker Desktop running. The database listens only on local port 55432.

## AI access

The workspace, sign-in, saved worksheets, and arithmetic work without an AI key.
To generate proposals or new AI calculations, set `OPENAI_API_KEY` in `.env`
and restart `npm run dev`. Enter the key in the file, not in chat or Git.
The server returns a clear configuration error until a key is available.

Model access is also required. Standard mode reads the database settings in
`server/services/genius-settings.ts`; Expert and PhD use the models defined there.
A configured key does not prove access to every model. Standard-mode generation
was verified on the public deployment on 2026-09-13. Expert and PhD remain
unverified. A fresh local checkout still needs its own authorized key.

## Subsequent runs

Run `npm run dev` from the repository root. It starts the native database
automatically. Keep that terminal open; Ctrl+C stops the app and database.
Saved data remains in `.local/postgres`. Run one dev server per checkout.
For Docker, run `docker compose up -d --wait db` first; `npm run db:stop` stops
its database without deleting the volume.

After pulling dependency or schema changes, run `npm ci` and `npm run setup`.
Setup preserves existing credentials/accounts and never forces destructive schema
changes. Read Drizzle's proposed changes before accepting a prompt. Back up data
before applying schema changes to a database you need to keep.

If `.env` names a custom database, setup refuses to seed or replace it. Keep that
database available, configure separate signing secrets, set
`LOCAL_DATABASE_DRIVER=external`, and deliberately run `npm run db:push` against
the intended development database. Provision an approved account through the
existing account/admin process. Never use production data for development.

## Verification

```sh
npm test
npm run check
npm run build
```

`npm test` creates a temporary database using the generated local credentials
and removes only that test database afterward. AI calls are mocked. It refuses
custom/remote database settings. Select suites with `npm test -- tests/unit`
or individual test paths.

The build produces `dist/index.js` and `dist/public/`. It does not imply
TypeScript checking passed. The imported source still has check failures;
see [the verification record](docs/PROJECT.md). Do not hide failing checks.
E2E and benchmark commands can require real AI access; inspect them first.

## Working with Codex

[AGENTS.md](AGENTS.md) explains the product, startup, source map, and working rules.
Start Codex in this repository root and ask it to run the app. Keep
[PROJECT.md](docs/PROJECT.md) updated with verified status.

For a new computer, give Codex the [copyable setup prompt](docs/CODEX-SETUP-PROMPT.md).

Read [DEPLOYMENT.md](docs/DEPLOYMENT.md) for production requirements, migration
limitations, storage, and release steps. The application is deployed at
[geniusx1.com](https://geniusx1.com), with Standard-mode AI generation verified.
