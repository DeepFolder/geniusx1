# Genius X1

Sanitized source export of the working Genius X1 application.

## Requirements

- Node.js 20+
- PostgreSQL 16+
- An OpenAI API key for AI features

## Fresh clone setup

```bash
cp .env.example .env
# Fill required values in .env
npm ci
npm run db:push
npm run dev
```

Open `http://localhost:5000` locally. On Replit, run the configured **Start application** workflow.

## Production build

```bash
npm ci
npm run db:push
npm run build
npm run start
```

The frontend is built to `dist/public` and the server bundle to `dist/index.js`.

## Export exclusions

Secrets, dependency folders, build output, chat/user uploads, cookie captures, debug screenshots/HTML, local IDE files, pgAdmin files, and credential-bearing Docker configuration are intentionally excluded. The only files retained from `attached_assets` are assets referenced by application source; `uploads/` contains only `.gitkeep`.
