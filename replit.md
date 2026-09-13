# Genius X1

Genius X1 is a standalone engineering calculation platform. A user describes an engineering problem in plain language and the app generates a transparent, editable, source-backed calculation: given inputs & assumptions, step-by-step working (with formulas rendered in KaTeX), charts/tables where applicable, headline results, an AI confidence score, and cited references. All numbers are recomputed deterministically on the server from each step's `expr` — the AI supplies structure and equations, never the arithmetic.

> Genius X1 replaced the former DeepFolder app but reuses its infrastructure (auth, DB, OpenAI, object storage, KaTeX/math rendering, units). DeepFolder pages/nav were removed; some server modules (products, companies, hybrid-search, dpf) still exist but are no longer surfaced in the UI.

---

## ⚠️ CORE INSTRUCTION FOR ALL AGENTS

Update `replit.md` at the end of any task that adds/removes/renames a feature, page, route, table, or top-level directory; changes the stack, commands, or env vars; introduces a new convention, gotcha, or architectural decision; or captures a new user preference. Treat this as part of "done".

**Where things go:** `replit.md` — project structure, stack, routes, scripts, env vars, conventions, gotchas, user preferences. `.agents/memory/` — durable cross-session lessons NOT derivable from the current code. Never duplicate across the two.

---

## Run & Operate

**Environment Variables:**
- `DATABASE_URL` — PostgreSQL connection string (Neon in prod, local Postgres in dev/test). `NEON_DATABASE_URL` also read where set.
- `OPENAI_API_KEY` — required for AI features and E2E tests (E2E auto-skips when missing).
- `SESSION_SECRET` / `JWT_SECRET` — session and JWT signing secrets.
- `NODE_ENV` — `development` | `production` | `test`.
- `PORT` — server port (defaults to 5000 in dev).
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` — object storage (required in production).
- `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN`, `REPL_SLUG`, `REPL_OWNER`, `APP_URL` / `SITE_URL` / `FRONTEND_URL` — URL construction in some flows.
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT` (default 587), `SMTP_SECURE` (`"true"` for port 465) — SMTP credentials for transactional email (password reset, admin notifications). If not set, emails are skipped with a console warning.
- `SMTP_FROM` — optional sender address (e.g. `"DeepFolder" <info@deepfolder.ai>`). Defaults to `"DeepFolder" <SMTP_USER>` when not set. Must be a real mailbox on the authenticated SMTP account or delivery will silently fail.
- `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID` — optional newsletter integration.

**Commands:**
- `npm run dev` — start dev server (Express + Vite, single port 5000).
- `npm run build` — build frontend (Vite) and backend (esbuild → `dist/`).
- `npm start` — run the built production server.
- `npm run check` — TypeScript type check.
- `npm run db:push` — push Drizzle schema to the database.
- `npm test` — run unit + integration suites.
- `npm run test:watch` — Vitest in watch mode.
- `npm run test:e2e` — E2E suite (auto-skips without `OPENAI_API_KEY`).
- `npm run benchmark` / `npm run benchmark:compare` — DeepSearch benchmark suite.

> ⚠️ Do not edit `package.json` scripts, `vite.config.ts`, `server/vite.ts`, or `drizzle.config.ts` without asking first.

## Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS, TanStack React Query v5, Wouter, Vite, shadcn/ui (Radix), recharts, Three.js
- **Backend:** Node.js 20, Express, TypeScript via `tsx` (ESM), WebSockets, Multer, SSE
- **Database:** PostgreSQL 16 (Neon in prod) via `pg` and `@neondatabase/serverless`
- **ORM:** Drizzle ORM (+ drizzle-zod)
- **Validation:** Zod
- **AI:** OpenAI (`openai`, `@openai/agents`, `@openai/guardrails`), `@ai-sdk/*`, LangChain core
- **Storage:** Google Cloud Storage (object storage) + local `uploads/`
- **Testing:** Vitest 4, supertest, jsonwebtoken (test token minting)

## Where things live

- **Genius X1 (the live app):**
  - **Global Genius X1 shell** (`client/src/components/layout/`) — `AppShell.tsx` wraps each page with a fixed 80px `TopBar.tsx` (glass top nav: hamburger, shared bold GeniusX1 SVG wordmark with black/white theme variants, switch-style light/dark toggle wired to genius `useTheme`, optional `right` actions slot) + a slide-out `AppSidebar.tsx` drawer (Calculations `/`, Admin `/admin` admin-only, Log out). `body { padding-top: 80px }` (in `index.css`) reserves the TopBar space. Pages own their `right` slot: genius passes `GeniusActions`, admin passes none.
  - `client/src/pages/genius.tsx` — the main app page (root `/`), wrapped in `AppShell`. Three-panel layout beneath the TopBar (`h-[calc(100vh-80px)]`): assistant chat LEFT (~340px, display-only), FLAT calculation workspace CENTER, calculation-tree navigation RIGHT (~260px, hidden when empty). Empty state = centered `EmptyHero` + `GeniusChatBar`; filled = `Worksheet` scrolls with `GeniusChatBar` docked at the bottom.
  - `client/src/features/genius/` — `useGenius.ts` (state + all mutations; web-search toggle persisted in `sessionStorage["genius-web-search"]`; `busyPhase` for progress labels; pending-proposal state — while a proposal is pending, `send()` refines the proposal instead of the calc), `api.ts`, `types.ts` (re-exports schema types; `ChatMessage` can carry an `attachment`/`proposal`), `markdown.ts` (export/download), `empty.ts` (`EMPTY_DOC` + `isEmptyDoc` — app starts empty), `useTheme.ts` (light/dark toggle, persists to `localStorage["genius-theme"]`, toggles `dark` on `<html>`), `AgentChat.tsx` (LEFT panel — messages, attachment chips, and the original orbit plus cycling-label busy cue, renders `ProposalCard` on the latest proposal message), `ThinkingProgress.tsx` (workspace loading UI: the orbit above a four-stage understand/derive/compute/assemble icon rail, live label, and optional elapsed timer), `ProposalCard.tsx` (reviewable "calculation task" card with Build/Discard actions), `GeniusChatBar.tsx` (DeepFolder-style floating chat bar — gradient/blur border, auto-expanding textarea, animated typed placeholder, ArrowUp submit; `leftSlot` now hosts the paperclip upload button + Globe web-search toggle with hidden file input), `GeniusActions.tsx` (New calc + History dropdown, rendered in the TopBar `right` slot), `EmptyHero.tsx` (centered empty-state hero above the chat bar), `Worksheet.tsx` (FLAT scrollable document — the PAGE owns the scroll container + empty state; each section has an anchor id `section-inputs|steps|results|charts|refs`), `SymbolLegend.tsx` (Symbol/Meaning/Unit legend derived from inputs+assumptions+steps, shown under the inputs table), `CalcTree.tsx` (RIGHT nav tree — the ONLY expandable surface; clicking a node `scrollIntoView`s the center; Calculation Steps expands to per-step links `step-<id>`), `formula.tsx` (`FormulaBlock` — wraps raw LaTeX in `\[\displaystyle …\]`, `subtle` variant, same font size as body), `InputsTable.tsx` (editable given/assumptions table + Recalculate), `StepsView.tsx` (flat step cards: formula→substitution→result, each `id="step-<id>"`), `ResultsView.tsx` (`ResultsList` + `ConfidenceAndReferences`), `VizRenderer.tsx` (recharts line/bar + tables).
  - **Admin** — `/admin` route (admin-only via sidebar gate) renders the legacy `features/hybrid-search/agent-admin.tsx` (`AgentAdminPage` + its own `AdminSidebar` sub-nav) wrapped in `AppShell`. Its internal `marginTop`/`minHeight` are offset by `80px` to sit under the global TopBar. Platform Admin is user-focused only: `components/admin/platform-admin.tsx` (stats, recent registrations, recent activity) + `components/admin/UserManagement.tsx` (user table with role change [User/Admin], suspend/unsuspend, delete). Products/Companies tabs, their stat cards, and the maintenance actions ("Bulk Extract Specs", "Migrate Uploads") were removed from the UI (backend routes remain).
   - `server/routes/genius.ts` — `requireAuth` router mounted at `/api/genius` (list, get, `POST /generate`, `POST /:id/message`, `POST /:id/recalc`, `POST /` save, `PATCH /:id` rename/pin, `PATCH /:id/details` metadata-only report details save, `DELETE /:id`, `POST /upload` image/PDF → attachment + task proposal + contextual `reply`, `POST /proposal/refine` (also returns `reply`), `POST /proposal/build`); owner-scoped by `req.user.id`. `/generate` and `/:id/message` accept an optional `webSearch: boolean`. Generate/message/recalc/build responses carry `{ ...row, commentary }` — a short AI-reasoned assistant reply about the recomputed calc. List returns `pinned` and sorts pinned first (`pinned IS TRUE DESC`), then by `updatedAt DESC`.
  - `server/services/genius-service.ts` — OpenAI gpt-4o (JSON response_format); prompt requires an evaluable `expr` per step. Also: `searchEngineeringReferences` (gpt-4o-mini + `web_search_preview` tool — finds real references, injected into the prompt as "VERIFIED WEB REFERENCES"; failures degrade to no refs, never block), `proposeTaskFromDocument` (image via vision data-URL / PDF via extracted text ≤24k chars), `refineTaskProposal`, `generateFromProposal`, `generateCommentary` (gpt-4o-mini second pass — reasoned reply interpreting the recomputed doc; rejected if it mentions numbers not grounded in the doc, degrades to `fallbackCommentary` factual summary, never blocks), `proposalFallbackReply`. Proposal model output includes a conversational `reply` field (stripped from the persisted proposal). `server/services/genius-eval.ts` — dependency-free safe math evaluator + dimensional-unit engine (cached SI/derived/scaled/compound parsing, canonical conversion, and review flags for incompatible or unknown units) + `recomputeDoc` (deterministic recalc) + `formatNumber`/`coerceNumber` + `commentaryNumbersAreGrounded`/`extractNumericTokens` (commentary grounding guard).
  - `shared/genius-example.ts` — `BALL_SCREW_EXAMPLE` sample doc (no longer the default; app starts empty via `empty.ts`). Genius schemas/types live in `shared/schema.ts` (`geniusCalculations` table + `genius*Schema`/types, incl. `geniusAttachmentSchema` + `geniusTaskProposalSchema`).
- **Frontend (`client/src/`) — legacy DeepFolder modules (no longer routed):**
  - `pages/` — former route pages (only `auth`, `reset-password`, legal pages, `not-found`, `genius` are still registered in `App.tsx`)
  - `features/deepsearch/` — DeepSearch chat UI; components, hooks, utils, constants, types
  - `features/hybrid-search/` — admin shell (`agent-admin.tsx` at `/admin`), per-user analytics
  - `features/dpf/` — DPF Converter UI
  - `components/` — shared shadcn-based components
  - `hooks/`, `lib/` — shared hooks and utilities (incl. `lib/queryClient.ts`)
- **Backend (`server/`):**
  - `routes.ts` — monolithic router for products, companies, users, files (mounted in `server/index.ts`)
  - `routes/` — split routers: `ai-routes.ts`, `dpf.ts`, `test-agent-routes.ts`, `api/documents.ts`
  - `services/` — shared services: ai-service, document-chunking/embedding, embedding-hooks, knowledge-graph, rag-retrieval, recommendation-engine, semantic-search, web-pdf-fetcher, datasheet-summarizer
  - `features/hybrid-search/backend/routes.ts` — main hybrid-search router: `POST /api/openai/agent-search-stream`, `POST /api/openai/calc-regenerate`, `/search-modes`, `/usage/*`, admin sub-routers
  - `features/hybrid-search/agents/` — query-classifier, expert-personas, manufacturer-discovery, agent-search, context-budget, context-compaction, history-compression, schemas
  - `features/hybrid-search/agents/admin/` — settings-routes, settings-storage, benchmark-routes (mounted under `/api/openai/admin`), access-request routes (`requirePlatformAdmin`)
  - `features/dpf/` — extractor.ts, ai-layer.ts, builder.ts
  - `objectStorage.ts`, `objectAcl.ts` — GCS + DB-fallback file storage
- **Shared:** `shared/schema.ts` — single source of truth for all DB + API schemas. `shared/agent-schema.ts` — agent Zod schemas. `shared/unit-canonical.ts` — unit display canonicalization (Nm→N·m, etc.), imported by both client and server.
- **Tests:** `tests/` — `chat/` (integration), `unit/` (pure), `e2e/`, `benchmark/`, `helpers/`, `fixtures/`, `mocks/`
- **Static assets:** `client/src/assets/`, `attached_assets/` (alias `@assets`)

## Where things live

- **Genius X1 (the live app):**
  - **Global Genius X1 shell** (`client/src/components/layout/`) — `AppShell.tsx` wraps each page with a fixed 80px `TopBar.tsx` (glass top nav: hamburger, shared original Genius SVG wordmark with the updated X1 mark and black/white theme variants, switch-style light/dark toggle wired to genius `useTheme`, optional `right` actions slot) + a slide-out `AppSidebar.tsx` drawer (Calculations `/`, Admin `/admin` admin-only, Log out). `body { padding-top: 80px }` (in `index.css`) reserves the TopBar space. Pages own their `right` slot: genius passes `GeniusActions`, admin passes none.
  - `client/src/pages/genius.tsx` — the main app page (root `/`), wrapped in `AppShell`. Three-panel layout beneath the TopBar (`h-[calc(100vh-80px)]`): assistant chat LEFT (~340px, display-only), FLAT calculation workspace CENTER, calculation-tree navigation RIGHT (~260px, hidden when empty). Empty state = centered `EmptyHero` + `GeniusChatBar`; filled = `Worksheet` scrolls with `GeniusChatBar` docked at the bottom.
  - `client/src/features/genius/` — `useGenius.ts` (state + all mutations; web-search toggle persisted in `sessionStorage["genius-web-search"]`; `busyPhase` for progress labels; pending-proposal state — while a proposal is pending, `send()` refines the proposal instead of the calc), `api.ts`, `types.ts` (re-exports schema types; `ChatMessage` can carry an `attachment`/`proposal`), `markdown.ts` (export/download), `empty.ts` (`EMPTY_DOC` + `isEmptyDoc` — app starts empty), `useTheme.ts` (light/dark toggle, persists to `localStorage["genius-theme"]`, toggles `dark` on `<html>`), `AgentChat.tsx` (LEFT panel — messages, attachment chips, and the original orbit plus cycling-label busy cue, renders `ProposalCard` on the latest proposal message), `ThinkingProgress.tsx` (workspace loading UI: the orbit above a four-stage understand/derive/compute/assemble icon rail, live label, and optional elapsed timer), `ProposalCard.tsx` (reviewable "calculation task" card with Build/Discard actions), `GeniusChatBar.tsx` (DeepFolder-style floating chat bar — gradient/blur border, auto-expanding textarea, animated typed placeholder, ArrowUp submit; `leftSlot` now hosts the paperclip upload button + Globe web-search toggle with hidden file input), `GeniusActions.tsx` (New calc + History dropdown, rendered in the TopBar `right` slot), `EmptyHero.tsx` (centered empty-state hero above the chat bar), `Worksheet.tsx` (FLAT scrollable document — the PAGE owns the scroll container + empty state; each section has an anchor id `section-inputs|steps|results|charts|refs`), `SymbolLegend.tsx` (Symbol/Meaning/Unit legend derived from inputs+assumptions+steps, shown under the inputs table), `CalcTree.tsx` (RIGHT nav tree — the ONLY expandable surface; clicking a node `scrollIntoView`s the center; Calculation Steps expands to per-step links `step-<id>`), `formula.tsx` (`FormulaBlock` — wraps raw LaTeX in `\[\displaystyle …\]`, `subtle` variant, same font size as body), `InputsTable.tsx` (editable given/assumptions table + Recalculate), `StepsView.tsx` (flat step cards: formula→substitution→result, each `id="step-<id>"`), `ResultsView.tsx` (`ResultsList` + `ConfidenceAndReferences`), `VizRenderer.tsx` (recharts line/bar + tables).
  - **Admin** — `/admin` route (admin-only via sidebar gate) renders the legacy `features/hybrid-search/agent-admin.tsx` (`AgentAdminPage` + its own `AdminSidebar` sub-nav) wrapped in `AppShell`. Its internal `marginTop`/`minHeight` are offset by `80px` to sit under the global TopBar. Platform Admin is user-focused only: `components/admin/platform-admin.tsx` (stats, recent registrations, recent activity) + `components/admin/UserManagement.tsx` (user table with role change [User/Admin], suspend/unsuspend, delete). Products/Companies tabs, their stat cards, and the maintenance actions ("Bulk Extract Specs", "Migrate Uploads") were removed from the UI (backend routes remain).
  - `server/routes/genius.ts` — `requireAuth` router mounted at `/api/genius` (list, get, owned snapshot history `GET /:id/versions` + `GET /:id/versions/:version`, `POST /generate`, `POST /:id/message`, `POST /:id/recalc`, `POST /` save, `PATCH /:id` rename/pin, `DELETE /:id`, `POST /upload` image/PDF → attachment + task proposal + contextual `reply`, `POST /proposal/refine` (also returns `reply`), `POST /proposal/build`); owner-scoped by `req.user.id`. `/generate` and `/:id/message` accept an optional `webSearch: boolean`. Generate/message/recalc/build responses carry `{ ...row, commentary }` — a short AI-reasoned assistant reply about the recomputed calc. List returns `pinned` and sorts pinned first (`pinned IS TRUE DESC`), then by `updatedAt DESC`.
  - `server/services/genius-service.ts` — OpenAI gpt-4o (JSON response_format); prompt requires an evaluable `expr` per step. Also: `searchEngineeringReferences` (gpt-4o-mini + `web_search_preview` tool — finds real references, injected into the prompt as "VERIFIED WEB REFERENCES"; failures degrade to no refs, never block), `proposeTaskFromDocument` (image via vision data-URL / PDF via extracted text ≤24k chars), `refineTaskProposal`, `generateFromProposal`, `generateCommentary` (gpt-4o-mini second pass — reasoned reply interpreting the recomputed doc; rejected if it mentions numbers not grounded in the doc, degrades to `fallbackCommentary` factual summary, never blocks), `proposalFallbackReply`. Proposal model output includes a conversational `reply` field (stripped from the persisted proposal). `server/services/genius-eval.ts` — dependency-free safe math evaluator + `recomputeDoc` (deterministic recalc) + `formatNumber`/`coerceNumber` + `commentaryNumbersAreGrounded`/`extractNumericTokens` (commentary grounding guard).
  - `shared/genius-example.ts` — `BALL_SCREW_EXAMPLE` sample doc (no longer the default; app starts empty via `empty.ts`). Genius schemas/types live in `shared/schema.ts` (`geniusCalculations`, immutable `geniusCalculationVersions`, and `genius*Schema`/types, incl. `geniusAttachmentSchema` + `geniusTaskProposalSchema`).
- **Frontend (`client/src/`) — legacy DeepFolder modules (no longer routed):**
  - `pages/` — former route pages (only `auth`, `reset-password`, legal pages, `not-found`, `genius` are still registered in `App.tsx`)
  - `features/deepsearch/` — DeepSearch chat UI; components, hooks, utils, constants, types
  - `features/hybrid-search/` — admin shell (`agent-admin.tsx` at `/admin`), per-user analytics
  - `features/dpf/` — DPF Converter UI
  - `components/` — shared shadcn-based components
  - `hooks/`, `lib/` — shared hooks and utilities (incl. `lib/queryClient.ts`)
- **Backend (`server/`):**
  - `routes.ts` — monolithic router for products, companies, users, files (mounted in `server/index.ts`)
  - `routes/` — split routers: `ai-routes.ts`, `dpf.ts`, `test-agent-routes.ts`, `api/documents.ts`
  - `services/` — shared services: ai-service, document-chunking/embedding, embedding-hooks, knowledge-graph, rag-retrieval, recommendation-engine, semantic-search, web-pdf-fetcher, datasheet-summarizer
  - `features/hybrid-search/backend/routes.ts` — main hybrid-search router: `POST /api/openai/agent-search-stream`, `POST /api/openai/calc-regenerate`, `/search-modes`, `/usage/*`, admin sub-routers
  - `features/hybrid-search/agents/` — query-classifier, expert-personas, manufacturer-discovery, agent-search, context-budget, context-compaction, history-compression, schemas
  - `features/hybrid-search/agents/admin/` — settings-routes, settings-storage, benchmark-routes (mounted under `/api/openai/admin`), access-request routes (`requirePlatformAdmin`)
  - `features/dpf/` — extractor.ts, ai-layer.ts, builder.ts
  - `objectStorage.ts`, `objectAcl.ts` — GCS + DB-fallback file storage
- **Shared:** `shared/schema.ts` — single source of truth for all DB + API schemas. `shared/agent-schema.ts` — agent Zod schemas. `shared/unit-canonical.ts` — unit display canonicalization (Nm→N·m, etc.), imported by both client and server.
- **Tests:** `tests/` — `chat/` (integration), `unit/` (pure), `e2e/`, `benchmark/`, `helpers/`, `fixtures/`, `mocks/`
- **Static assets:** `client/src/assets/`, `attached_assets/` (alias `@assets`)

## Architecture decisions

- **Feature-based organization** — frontend and backend group code by feature (`features/<name>/`).
- **Strict file size limits** — pages ≤ 120 lines, components ≤ 250 lines. Refactor before crossing.
- **Single source of truth for schemas** — `shared/schema.ts` only; types flow into both client and server.
- **AI-first with fallbacks** — search, insights, and assistance are AI-powered with deterministic degradation.
- **Stateless agents** — all conversation history, context, and user state passed explicitly.
- **Versioned prompts** — prompts ship with the code; benchmark overrides in `benchmark-prompts-override.json`.
- **All file uploads → object storage with DB fallback** — multer.memoryStorage() → GCS via `uploadFileBuffer()`; falls back to base64 in `file_storage` table returning `/api/files/:id` URLs when GCS tokens unavailable. Public images get `visibility: "public"`; datasheets/docs/models get `private`.

## Product

- **Natural-language → calculation** — describe a problem; gpt-4o returns a structured calc document (inputs, assumptions, steps with `expr`, results, references, confidence, visualizations).
- **Web-search toggle** — Globe button in the chat bar; when ON, generation/follow-ups first run a live web search (gpt-4o-mini + `web_search_preview`) and cite the found references instead of placeholders. Search failure never blocks generation.
- **Upload → review → build** — paperclip in the chat bar accepts images (PNG/JPEG/WebP/GIF) and text-PDFs (≤15 MB). The assistant reads the document and proposes a reviewable "calculation task" (`ProposalCard`: understanding, problem, inputs, assumptions, approach). While pending, chat messages refine the proposal; "Build calculation" creates the calc, "Discard" cancels. Typed prompts are unaffected and generate directly. Scanned/image-only PDFs are rejected (422). Files stored via object storage ("genius" folder, private) with non-fatal storage failure.
- **Progress feedback** — `busyPhase` drives a shared four-stage AI-thinking indicator (understand → derive → compute → assemble) with cycling status copy in the assistant panel and an elapsed timer in the empty-state hero.
- **Reasoned assistant replies** — after generate/follow-up/recalc/build the assistant reply is a server-generated AI commentary (interpretation, plausibility check, driving assumptions, optional next step). It may only cite numbers already present in the recomputed document (server-side grounding check); on failure it degrades to a factual summary. Upload/refine replies are contextual (model `reply` field) instead of fixed strings.
- **Deterministic recompute** — the server evaluates each step's `expr` (`genius-eval.ts`) so all displayed numbers are computed, never hallucinated. Editing inputs/assumptions + Recalculate re-runs the same engine.
- **Starts empty** — no example is preloaded; the worksheet shows an empty state until the user describes a problem. "New calculation" resets to `EMPTY_DOC` (`empty.ts`).
- **DeepFolder shell restored** — global fixed 80px glass TopBar (DeepFolder logo + slide-out sidebar drawer for Calculations/Admin/Log out) sits above every page; `/admin` is back (admin-only). Genius keeps its 3-panel workspace and the light/dark toggle now lives in the TopBar.
- **Three-panel workspace with tree navigation** — assistant chat LEFT (display-only), FLAT scrollable calculation CENTER with a DeepFolder-style floating chat bar (empty = centered hero + bar; filled = bar docked at the bottom), calculation-tree navigation RIGHT. The calculation itself is NOT collapsible; the right-hand tree is the only expandable surface and clicking a node smooth-scrolls the center to that section (`section-inputs|steps|results|charts|refs`) or individual step (`step-<id>`). Section order: Input Values (+ symbol legend) → Calculation Steps → Results → Charts & Tables → Confidence & References.
- **Theme toggle** — light/dark switch in the TopBar (`useTheme.ts`); plain white/black background, no decorative math-mesh. All fonts (including KaTeX formulas) are kept at the same body size — formulas are not enlarged.
- **KaTeX working** — formulas/substitutions rendered via `InlineMath`/`RichTextRenderer` from `@/components/chat/RichTextRenderer`.
- **Visualizations** — recharts line/bar charts and data tables (`VizRenderer.tsx`) driven by the AI's `visualizations[]`.
- **Save / history / export** — calculations persist per-user in `genius_calculations`; every verified calculation-changing save receives a bounded immutable snapshot in `genius_calculation_versions`. The worksheet can open a snapshot by version (with server-derived change summary) in read-only mode and return to the latest editable calculation; legacy records are seeded only with their current recoverable document. Sidebar history loads/deletes calculations; Markdown export via `markdown.ts`.
- **Secure Authentication (reused)** — required login using existing accounts; role-based with real-time suspension enforcement. Root `/` is gated by `AuthGate`; unauthenticated users see the Auth page.
- **Admin Approval Gate (reused)** — new registrations set to `approvalStatus = 'pending'` and must be approved before login. Values: `'pending' | 'approved' | 'rejected'`.

### Legacy (code present, not surfaced in UI)
Hybrid Search, DeepSearch, DPF Converter, Benchmark/Model-Pricing Admin, Company/Product management, and Document RAG server code remain from DeepFolder but are no longer routed in the frontend.

## Testing

| Project | Includes | Purpose |
|---------|----------|---------|
| `chat` | `tests/chat/**/*.test.ts` | Integration tests — real Express via `tests/helpers/app.ts`, mocked DB/auth/OpenAI |
| `infra` | `tests/smoke.test.ts`, `tests/unit/**/*.test.ts` | Pure unit tests, no I/O |
| (e2e) | `tests/e2e/**` | Real Express + real OpenAI; auto-skips without `OPENAI_API_KEY` |

Key helpers: `tests/helpers/{app,auth,db,types}.ts`, `tests/fixtures/`, `tests/mocks/openai.ts`. Co-located unit tests live next to the module (e.g. `server/features/hybrid-search/utils/__tests__/`).

TDD loop: write failing test → implement until green → refactor → `npm test` before done.

## User preferences

- Preferred communication style: simple, everyday language.
- Expects platform stability — core flows must work reliably without errors.
- Production-ready authentication only; no demo users/companies.
- Strong preference for **separate, dedicated interfaces** over integrated ones.
- Favors dedicated AI interfaces and ML recommendation systems as standalone features.
- Prefers simple, clean, user-friendly designs with easy-to-find information and straightforward downloads.
- Industrial / technical aesthetic (TraceParts-like) with modern touches — table layouts, technical specs, CAD-focused interfaces.

## Geo Stats / User Origins

- `GET /api/openai/admin/usage/geo-stats` — returns aggregated `{country, city, count}` rows from `hybrid_search_usage`.
- IP geolocation comes from CDN headers only (`cf-ipcountry`, `x-vercel-ip-country`, `x-vercel-ip-city`). No third-party IP lookup is performed. Country stored as ISO-2 code; displayed using `Intl.DisplayNames` in the frontend.
- Existing DB rows without country/city (created before CDN headers were forwarded) appear as empty on the globe; only new searches with CDN geo headers will populate location.
- `GlobePanel.tsx` — Three.js interactive 3D globe. Uses canvas-painted world map texture from `worldTexture.ts` (simplified continent polygons, no external deps). Supports mouse drag, scroll zoom, and touch/pinch.
- `GeoStatsPanel.tsx` — ranked country list with flag emoji + mini bar; collapsible city breakdown.

## Gotchas

- **`apiRequest` signature** — `(url: string, options?: RequestInit)` in `client/src/lib/queryClient.ts`. Do NOT use the 3-arg form `apiRequest('POST', url, body)`.
- **`pg` under `tsx` ESM** — `import { Pool } from 'pg'` fails. Use `import pg from 'pg'; const { Pool } = pg;`.
- **File size enforcement** — pages ≤ 120 lines, components ≤ 250 lines.
- **Data fetching** — always TanStack Query v5; never `useEffect + fetch`. Array queryKeys: `['/api/x', id]`.
- **API validation** — every backend body validated with Zod (drizzle-zod schemas from `shared/schema.ts`).
- **Drizzle schema** — all changes go through `shared/schema.ts` + `db:push`. Always approve the migration screen when publishing so prod DB stays in sync.
- **`database-search.ts` field names** — DB products use `catalogPath` (not `datasheetPath`) for the datasheet and `modelPath` for the 3D model. Wrong name silently returns empty strings.
- **`products.datasheet_text`** — raw PDF text stored at upload time by `autoExtractAndPersistSpecs`. Hybrid engine reads this column first (layers 1 & 2) and only falls back to file reads when null.
- **File storage** — all `/uploads/` paths migrated to `/api/files/:id` (DB-backed). The old "Migrate /uploads/ Files" admin button was removed with the Products/Companies UI; if legacy paths reappear, call `POST /api/platform-admin/products/migrate-uploads` directly.
- **Spec extraction** — `products.specifications` (JSONB) populated by `autoExtractAndPersistSpecs()` on create/update. The "Extract Missing Specs" admin button was removed; for older products call `POST /api/platform-admin/products/bulk-extract-specs` directly.
- **State management** — no prop drilling beyond 2 levels; lift to a hook or context.
- **Inline calc regeneration** — `given` rows built deterministically on the server (never from AI output). Calc context sent to gpt-4o is a STRUCTURE-ONLY TEMPLATE — all numeric values and summary stripped so the model must compute fresh. Server coerces all returned numeric `value` fields to `String` before responding. `MaybeMath` and `UnitMath` also coerce defensively so persisted pre-fix data (bare numbers) renders safely.
- **Recalculate re-runs product search in `size_then_search`** — `/api/openai/calc-regenerate` recomputes the calc, then (only for `size_then_search`) builds an augmented query embedding the new computed `result` + `derived_specs` as explicit target requirements, forces a pure `product_search` (no re-calc, `sessionId=null` so it doesn't persist server-side), and returns `productCards`. Wrapped in try/catch — a search failure still returns the new calc with `productCards: undefined`. Client `regenerateCalculation` swaps in the new cards for messages that already had products and persists them via PATCH. NOTE: this makes Recalculate slow (~30–50s, full hybrid search); the `isRegeneratingCalc` spinner covers it. When updating products client-side, compute `nextSearchResults` from the captured `msg` (not `aiMessagesRef.current` post-`setAiMessages`, which is stale) so the PATCH persists the NEW products.
- **Calculation ordering** — classifier sets `strategy.calculation_mode`: `size_then_search` (calc before products) or `search_then_size` (products before calc). Agent uses `CALCULATE_THEN_SEARCH_BLOCK` / `SEARCH_THEN_CALCULATE_BLOCK` accordingly.
- **Tests must not touch production Neon DB** — `tests/setup.ts` redirects `server/db` to local Postgres. Its mock must export everything routes import from `server/db` (incl. a passthrough `withDbRetry`) or routes 500 with "No export defined on mock".
- **`tests/mocks/openai.ts` mock is not `new`-constructible** — its `vi.fn().mockImplementation(() => …)` arrow fn fails for modules that do `new OpenAI()` at import time (e.g. dpf ai-layer). Test files needing constructible OpenAI mocks should declare their own `vi.mock("openai")` with a `function` implementation + `vi.hoisted` fns (see `tests/chat/genius-uploads.test.ts`).
- **Benchmark runner dual-writes** — saves locally via `pg.Pool` AND POSTs to `https://deepfolder.replit.app/api/openai/admin/benchmarks`.
- **Agent instructions size cap is validator-side** — `instructions` column is unbounded `text`; the PUT validator in `settings-routes.ts` caps at 1,000,000 chars. Bump the validator if you hit a Zod size error — don't touch the DB.
- **Object storage — always pass explicit bucketId** — `new Client()` without `{ bucketId }` silently fails in deployed environments. `server/objectStorage.ts` and `objectAcl.ts` use a `resolveBucketId()` helper reading `DEFAULT_OBJECT_STORAGE_BUCKET_ID` first. All three storage env vars must be set in production.

## Pointers

- React Query: https://tanstack.com/query/latest/docs/react/overview
- Drizzle ORM: https://orm.drizzle.team/docs/overview
- Tailwind CSS: https://tailwindcss.com/docs
- shadcn/ui: https://ui.shadcn.com/docs
- OpenAI API: https://platform.openai.com/docs/overview
- Three.js: https://threejs.org/docs/
- Vitest: https://vitest.dev/
