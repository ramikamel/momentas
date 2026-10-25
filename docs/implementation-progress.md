# Execution ledger: momentas

Plan: docs/superpowers/plans/2026-10-24-momentas.md

- User authorized implementation and low-reasoning subagents on 2026-10-24.
- Task 1: in progress. Initial inspection found no configured Meta, Supabase, or Vercel credentials. User is configuring all three required API/storage variables in .env.local.
- Ruling: Work in the supplied empty directory; there is no Git repository or existing branch to isolate. No worktree is needed.
- Ruling: Continue independent implementation while credentials are pending, with a development-only local durable Store and the planned Supabase production Store. This allows local verification but does not prove live model calls or production deployment.
- Pre-flight: Domain types shared by UI, storage, and routes are defined in src/lib/memory/types.ts before delegation. Root owns validation/providers/domain/routes/tests; UI agent owns components/pages/styles; storage agent owns Store adapters/migration/storage tests.
- Ruling: Preserve the approved Next.js/Supabase/Vercel architecture. Sites' Cloudflare starter is incompatible with this approved stack; no Site registration or publishing is performed through that workflow.

## Integration results

- Project externally renamed to `/Users/rami/github/momenta`; user explicitly authorized continuing there. Configuration preserved in `.env`.
- Tasks 2-6: implemented and integrated. Storage adapters have 11 passing focused tests; access, extraction, lifecycle, publication and URL handling bring the suite to 24 passing tests.
- Task 1 live Muse smoke: extraction 11.648 seconds; generation 48.004 seconds; edit 17.223 seconds. Both real outputs inspected. Single-moment prompt tightened after initial duplicate-person artifact.
- Supabase migration applied by user. All four tables verified; private bucket verified; upload/read/sign/publish/question/reply live checks passed with labeled fictional sample.
- Task 7 local verification: lint/typecheck/build pass; Playwright two-browser journey passes, including edit failure recovery, private drafts, real human roles and approval after refresh. Desktop/mobile pages inspected; private remote image loading confirmed at 1920x1280.
- Fresh reviewer found unapproved scene restoration on reload; fixed and covered in the browser regression. Published reply identity also changed to published author name to avoid draft identity leakage (test observed red then green).
- Ruling: Unit render/publication coverage is consolidated in tests/service.test.ts and tests/store.test.ts rather than separate tests/render.test.ts and tests/publish.test.ts; behavior remains the test boundary.
- Ruling: App remains Next.js/Supabase with the approved Vercel deployment instead of Sites; the approved infrastructure takes precedence over the Sites starter workflow.
- Ruling: No Git repository or external source push is created; source is delivered in the requested workspace.
- Ruling: Auto-review initially rejected transferring production credentials. User then explicitly approved storing MODEL_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in encrypted Vercel production variables; configuration succeeded after approval. No secrets were put in command arguments or output.
- Task 7 production deployment: in progress.
- Task 8: demo narration script and submission draft saved. Narrated video and actual hackathon submission remain distinct from product implementation.

## Final production verification

- Vercel deployment READY: https://momentas-hacktx.vercel.app (deployment dpl_8qCB1zUjCLZdZHQDGSCFdR8gZSCp). Anonymous root and status API return 200; production status reports Meta configured, Supabase storage, test mode false.
- Actual production browser flow passed: new memory, real Spark extraction, real image generation (17.572 seconds), image edit (15.112 seconds), publication, recipient with cleared author cookies, question, restored author cookie and personal reply, recipient reload. No browser errors.
- Silent walkthrough saved: output/demo/momentas-walkthrough.webm. Fictional sample and actor roles labeled. Production recipient screenshot saved in output/demo/production-recipient.png.
- Tasks 1-7: complete for MVP. Task 8: silent walkthrough, narration script and submission copy delivered; final narration and official form submission are user follow-up.
- Final source verification after formatting/layout fixes: lint, typecheck, 24/24 tests and production build pass. Browser journey passed with failed edit recovery, private drafts, actor roles and saved-unapproved-scene reload regression.
- Deferred: optional voice input, exact identity/scene consistency, account recovery, final narrated video and actual hackathon form submission.

## momentas rename and GitHub handoff

- User requested the momentas name everywhere and a GitHub push. Updated app wordmark/title, npm metadata, docs and their filenames, recording script/artifact names, and Vercel project name.
- V1 share-token derivation bytes intentionally preserved so existing published links and author-derived URLs remain valid. Golden compatibility fixture passes.
- Added output/ to Git exclusions. Audited staged files for credential patterns and excluded dotenv files, local capabilities, recordings, caches and dependencies.
- Verification: lint, typecheck, 25 tests and production build pass.
- Private repository created: https://github.com/ramikamel/momentas. Deployment project renamed to momentas; public app address is https://momentas-hacktx.vercel.app.

## Photography default and momentas rename

The project is now **momentas**. The shared Muse image directive defaults to a candid photorealistic camera image, with natural available light, believable optics, lifelike textures and a single moment. Generation and reference edits use the same directive. Editing a previously stylized image requests conversion to photographic realism while preserving the approved scene. The UI uses image/reconstruction language and identifies outputs as AI reconstructions rather than original photographs. Existing image versions and the immutable v1 share-token derivation are preserved.

The public app, repository links, package metadata and judging materials use the new name. A real fictional Muse generation/edit smoke check refreshes the landing sample. New provider-boundary tests cover both endpoints receiving the photography directive alongside approved details and revision instructions.

Verification for this update: 27 unit/integration tests passed; lint, TypeScript and production build passed; the complete isolated browser journey passed (including failed-edit recovery, sharing, human replies and private draft access). Live Muse extraction/generation/edit succeeded in 15.4 / 34.1 / 20.8 seconds. Both new images were visually checked and show photographic rather than storybook rendering. These timings are single observations.


## Connection extension implementation (2026-10-24)

Implemented on isolated `feat/connection-features` from `dfd3167`: shared publication snapshots with additive 002 migration/backfill; optional canonical WAV capture/transcription/private storage; selected quote pins and publication-scoped messages; capability-scoped one-contribution invitation; independently authored photographic perspectives; cached source-validated Spark synthesis; responsive reveal and real human reply flow.

The user confirmed the 002 migration succeeded in Supabase. A local PostgreSQL-compatible check exercised 001 + 002 backfill, pins, narration, request reservations, publication, concurrent-safe/idempotent claim, synthesis, reply context, same-image stale-publication rejection, and frozen comparison messaging. The real Supabase service lifecycle also passed including private audio and a contextual question/reply. A published speech fixture was used solely to test transcription, kept private and outside the repository/showcase; live VoiceService upload/reserve/transcribe/persist passed. Real Muse Spark comparison returned validated evidence. Voice API requests use explicitly typed JSON multipart settings; Spark comparisons use low reasoning and a bounded output budget.

Ruling: native worktree creation used the chat's stale original folder and reported Not a git repository; a manual isolated worktree from the actual repository was used instead. Cost if wrong: checkout confusion; the base commit and branch were explicitly verified.

Ruling: all three low-reasoning subagents reached the account usage limit after partial work, so the high-reasoning orchestrator completed the work directly and reviewed the integration, authorization and SQL. Cost if wrong: less independent review; compensated with service tests, two-browser journeys, live services and explicit ownership/race checks.

Ruling: local Turbopack production compilation could not bind its helper port under the host sandbox. The supported webpack production builder passed; hosted Vercel compilation is separately verified at release. No product dependency or remote runtime workaround was introduced.

The fictional showcase has two distinct real Muse images (existing child view and one new father view), quote pins and cached insights. It deliberately contains no fabricated narrator voices: the presenter can add their actual recordings through the app. Owner capabilities, downloaded test speech, screenshots, and prepared files remain ignored.


## Connection extension release verification

- Merged and pushed implementation through `4dfbb6a` to GitHub main. Production deployment `dpl_EnCpifdvZSDYHRKcSs13nWFQxMu1` reached READY with the normal Vercel build.
- The existing Vercel project now reports https://www.momentas.tech as its production alias; https://momentas-hacktx.vercel.app also returns 200. No domains were modified during this release.
- Hosted browser verification passed on the custom domain: voice-first entry, two distinct loaded comparison images, desktop/mobile screenshots, no mobile overflow, and no browser errors. Authenticated WAV upload and real Muse transcription returned a saved 107-character transcript. Owner audio access succeeded; anonymous draft/audio access was denied. Test speech remained private and outside the showcase.
- Final primary-main verification: 43 tests in 12 files passed; lint and TypeScript passed. The three full browser journeys and the webpack production bundle passed before release; the remote production build also passed.
- Showcase: https://www.momentas.tech/compare/Mb93rbSsERGc7wjm_DIyOqVd2k0CiFI1qeQK7-v39BQ . This is a clearly labeled fictional example with real Muse images and grounded insights; it has no recorded narrator voices.
- Hosted screenshots are preserved locally under output/connection-features/hosted; private capabilities, fixture audio, configuration and artifacts remain ignored.


## Natural image details update

Replaced the hidden annotation disclosure, duplicate preview, extracted-detail selector and quote-copy field with a visible Add a detail button on the generated image. Click/tap or keyboard placement opens a free note composer; Save detail persists immediately, with edit/remove/cancel and recoverable save errors. Existing quote pins and immutable published comparisons remain compatible. New author notes are labeled as storyteller additions.

Added real SAM 3.1 point-prompt segmentation on the owner’s stored image using the existing Meta key. The official parser decodes masks; bounded simplified SVG contours stay aligned on responsive images. A note can be saved as a simple pin if outlining fails, is cancelled, or selects the wrong object. Requests use the owner’s saved bytes, no arbitrary external image URL, bounded image size, response size and timeout.

Review found process-local outline quotas insufficient and a stale keyboard marker; both were fixed. Additive migration 003 reserves paid outline attempts atomically (20/version, 120/project, failed attempts count, one pending per version with 120-second expiry). Missing migration fails closed for paid calls and preserves plain-pin note saving. The user was asked to apply this via SQL Editor because the service-role API cannot change schema. Local PostgreSQL-compatible checks passed all migrations, ownership, anonymous denial, pending/duplicate protection, failure counting and cap enforcement.

Verification: 53 unit/integration tests and four browser journeys passed, including new note publication/question/reply, cancellation of delayed outlines, retry without text loss, keyboard placement and removal. Lint/TypeScript passed. Real SAM selected and outlined the fictional father in 9.5 seconds; inspected desktop/mobile screenshots show the actual contour. Real Supabase note and contour save/read passed; the fictional sample’s draft pins were restored. Final reviewer reported no remaining important findings. Production release verification follows.

Release: implementation `73df37c` is pushed to main. Vercel production deployment `dpl_GFDnTAN8c7fWNsmAUoDpLF1yYukA` reached READY at https://www.momentas.tech using the normal remote build. User confirmed migration 003 succeeded. Hosted browser verification then passed with an actual paid SAM call through the owner route and durable reservation: real object contour rendered, new note/contour saved/read in Supabase, desktop/mobile no overflow, no page errors, anonymous outline request denied. Original fictional sample draft pins were restored after checking. Hosted screenshots are preserved under ignored output/natural-details/hosted. Local production webpack build also passed.


## Demo flow update

User explicitly requested removing the exhausted image limit, a discoverable saved-picture view, and optional scene review. The old MAX_IMAGE_REQUESTS setting is no longer read. Local rendering has no application cap; the existing Supabase int-cap RPC receives 2147483647 for compatibility while preserving atomic pending and replay checks, avoiding another schema migration. Voice/comparison/outline budgets are unaffected.

Submit & generate image now reserves, extracts and generates directly; Add details opens optional scene editing with no required checkbox. Homepage errors retain the same saved draft. Request IDs persist across ambiguous errors, completed requests replay their image, and failed/expired reservations return an explicit terminal code so a subsequent deliberate retry can recover. Submission authorizes generation; publication remains explicit.

Saved pictures is linked from the homepage, memory workspace, shared image, invitation and comparison. The private gallery validates existing HttpOnly owner cookies and exposes every saved image version plus drafts, with direct version selection. It has no global memory index. Editing access remains specific to the browser and site address.

Verification so far: 59 unit/integration tests pass, seven browser journeys pass, lint/TypeScript/webpack production build pass. Regression checks include more than 24 prior failed attempts despite stale env setting, completed-request replay without additional provider calls, pending/expired recovery, response loss after completed generation, all-version gallery, forged/anonymous cookie exclusion, and previous voice/pin/comparison/human-reply flows. Final reviewer reported no remaining actionable findings after recovery fixes. Hosted generation/gallery verification follows release.

Production release: implementation `9f2dfa5` pushed to main; Vercel deployment `dpl_GbhApKEFqrp5kJPdCLx8hwTVgxy6` reached READY at https://www.momentas.tech. Before release, the live database had exactly 24 reserved image attempts. After release, a real browser Submit generated a real fictional Muse image successfully, with no review page/checkbox. Complete generation/gallery/reopen verification took 35 seconds, no page errors. The image loaded in the new private gallery on desktop/mobile, selected version reopened, no mobile overflow, and an anonymous library remained empty. The currently shared comparison also exposes its Saved pictures link. Screenshots and private verification state are preserved under ignored output/demo-flow and .data. No new migration or credentials required.
