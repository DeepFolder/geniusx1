# Prompt for a fresh Codex workspace

Copy the prompt below into Codex on the new computer.

```text
Set up and run Genius X1 on this computer. Carry out the work, including resolving
setup problems, and leave the verified app running.

Genius X1 is an engineering calculation workspace. It turns questions into
editable calculation documents with inputs, equations, results, and references.
The server performs the numerical calculations.

1. Check Git, Node.js 24, and npm 11. Install missing prerequisites using the
   appropriate method for this operating system. Ensure npm uses Node.js 24 too.

2. Clone https://github.com/DeepFolder/geniusx1.git on the main branch.
   The historical master branch is an old starter.
   If the current project folder is empty, clone directly into it:

   git clone --branch main https://github.com/DeepFolder/geniusx1.git .

   If this is already the same repository, check Git status, preserve local
   changes, fetch, and update the application branch without overwriting work.
   For an unrelated nonempty folder, use a new geniusx1 subfolder.

3. Read AGENTS.md, README.md, docs/PROJECT.md, and docs/DEPLOYMENT.md before making
   changes. Confirm scripts/setup-local.mjs exists in the fetched application.

4. From the repository root, run:

   npm ci
   npm run setup
   npm run dev

   Default setup creates native PostgreSQL, unique local secrets, and a local
   admin account. Docker and a Replit account are not required. On Linux, run
   PostgreSQL as a normal user. Follow the README if an existing custom database
   is configured.

5. Open http://localhost:5000 and verify the actual Genius X1 workspace and
   sign-in using .local/login.txt. Keep credentials private. UI and API share
   port 5000; the old component preview on port 5173 is unrelated.

6. If OPENAI_API_KEY is missing, run the app anyway and explain how I can add it
   privately to .env and restart. AI generation also needs access to the selected
   models. Do not claim real AI works until verified with real credentials.

7. Run the build, type check, and relevant isolated tests through npm test.
   Read the known failures in docs/PROJECT.md and report what passes or fails.
   Avoid paid AI benchmarks. Do not use Prettier, cargo fmt, or broad formatting.
   Trace dependencies and callers before any setup fix.

8. Leave the app running with its browser open. Tell me the URL, where to find
   my local login details, what was verified, and any exact next step I need to
   take. This request is for local setup; public deployment is a separate task.
```
