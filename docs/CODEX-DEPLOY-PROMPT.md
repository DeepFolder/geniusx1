# Prompt for publishing and deploying Genius X1 updates

Copy the prompt below into your colleague's Codex workspace when the reviewed
changes are ready to publish. This authorizes a production update when the prompt
is used; writing this document does not deploy anything.

Use the published `main` branch for new work and releases. The colleague needs
GitHub write access and an SSH key authorized by the VPS owner. Git does not
provide server access or production credentials. Read `docs/PROJECT.md` for the
current source and live-deployment status.

```text
Publish my reviewed Genius X1 changes to GitHub and deploy them to the existing
production app at https://geniusx1.com. Carry out the deployment and verify it.
Pushing Git alone does not deploy this app; use its existing Docker deployment.

Project and access:
- Repository: https://github.com/DeepFolder/geniusx1.git
- Application branch: main. master is an old starter.
- Hostinger VPS: 69.62.119.45, ID 1812633, owned by albertsalicunaj.
  Do not use the mikelkrasniqi hosting account.
- CloudPanel is already installed. Genius X1 is independent of DeepFolder.
- Use an owner-authorized SSH account/key and verify the server host key.
  The existing server admin account is deepfolder-admin with sudo; root SSH
  is disabled. This account name does not make DeepFolder part of this app.
- If access is missing, finish the local preparation and identify the exact
  GitHub permission or SSH public-key registration the owner needs to provide.
  Never request private keys, passwords, or API keys in chat.

1. Inspect Git status and preserve existing work. If this is a fresh workspace,
   clone the repository on main. Fetch the current remote
   branch and review any divergence before integrating changes. Read AGENTS.md,
   README.md, docs/PROJECT.md, docs/DEPLOYMENT.md, and deploy/README.md.
   Confirm Dockerfile and deploy/compose.production.yml exist. If they are
   missing, the original workstation's deployment commits must be published
   first. Do not invent replacement infrastructure or deploy an older export.

2. Trace the changed code's callers, dependencies, authentication, and database
   impact. Use Node.js 24, npm 11, and the locked dependencies. Follow the README for
   fresh local setup. Run the relevant isolated tests through npm test, the type
   check, build, and git diff --check. Compare failures with the documented
   baseline and fix regressions. Never use production data for tests, format
   entire files, or use Prettier/cargo fmt.

3. Commit only the reviewed changes and push the application branch without
   force-pushing. Verify GitHub contains the intended commit. Check the live
   /api/build-info and ensure the release includes the currently deployed code
   as well as the new changes. Do not silently replace work from another author.

4. Connect to the correct VPS and read /opt/geniusx1/README.md. Preserve the
   current APP_IMAGE for rollback. Genius X1's existing resources are:
   - Root: /opt/geniusx1
   - Compose: /opt/geniusx1/compose.production.yml
   - Private environment: /opt/geniusx1/shared/app.env, root-owned, mode 600
   - Releases: /opt/geniusx1/releases/<full-commit>
   - Docker project: geniusx1; network: geniusx1-backend
   - Volumes: geniusx1-postgres-data and geniusx1-uploads
   - CloudPanel proxy: 127.0.0.1:5081, forwarding to app port 5000
   The database, production AI key, signing secrets, DNS, and HTTPS already
   exist. Preserve them. Keep other apps, ports, volumes, and pipelines untouched.

5. Export the exact pushed commit with git archive and transfer it into a new
   release directory. Do not upload .env, .local, node_modules, or credentials.
   In that directory, build using the existing Dockerfile on the Linux VPS:

   sudo -n docker build --memory=2g --build-arg APP_BUILD_SHA=<full-commit> --build-arg APP_BUILD_DATE=<UTC-date> -t geniusx1:<full-commit> .

   Replace placeholders with the verified commit and UTC timestamp. Keep the
   running app available while building and retain the previous image.

6. Run sudo -n /usr/local/sbin/geniusx1-backup and confirm it succeeded before
   changing the live app. Apply only reviewed migrations required by this
   release. Never run initial database setup or db:push --force on production.
   If compose changes are required, review and back up the installed file before
   updating it; keep the same project, ports, volumes, and private credentials.

7. Change only APP_IMAGE in the private environment file to the new image,
   preserving every other value and the file's ownership/permissions. Do not
   display environment values. Recreate only the app service:

   sudo -n docker compose --env-file /opt/geniusx1/shared/app.env -f /opt/geniusx1/compose.production.yml up -d --no-deps --wait --wait-timeout 90 app

   When piping a shell script over SSH, disconnect stdin for commands that might
   consume the rest of it. Never delete volumes or run docker compose down -v.

8. Verify HTTPS, /api/ready, /api/build-info matching the deployed commit, the
   actual browser workspace, sign-in, and the changed feature. With an authorized
   test account, verify saving, recalculation, reload, and version history. This
   request authorizes one small Standard-mode AI calculation for the release
   check, not a benchmark. Remove only your own verification calculation.
   Readiness alone does not prove AI works. Expert/PhD, email, and upload flows
   need their own checks before claiming they work.

9. If release checks fail, restore the previous APP_IMAGE and recreate only the
   app when it is compatible with the current schema. Do not improvise a database
   rollback or overwrite live data. Report any migration compatibility blocker.

10. Update the deployment records with the actual live commit, migrations,
    verification, and remaining issues. Keep server operating notes current.
    Publish the documentation update too. Report separately what reached GitHub
    and what is actually live, with the URL and any exact next action I need.
```
