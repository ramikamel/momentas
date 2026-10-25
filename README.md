# momentas

Let me show you how I remember it.

Live app: https://momentas-hacktx.vercel.app

Source: https://github.com/ramikamel/momentas

Write a memory, review its source-linked scene details, create and refine a lifelike memory reconstruction with Meta's Muse APIs, then share the approved version and exchange human questions and replies.

## Local setup

Requires Node.js 22+. Verified locally with Node 26.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configure `MODEL_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (an existing `.env` works). Supabase accepts a project-root URL or its `/rest/v1` endpoint. Use the server-side secret/service-role key; never expose it with a `NEXT_PUBLIC_` prefix.

Run `supabase/migrations/001_memories.sql`, then `supabase/migrations/002_connection_features.sql`, once in the project's SQL Editor. Existing projects with 001 applied need only the additive 002 migration. It creates private tables, atomic render/message RPCs and the private `memory-images` bucket. The REST service key cannot execute schema SQL.

Open http://localhost:3000. Without Supabase credentials, development persists in `.data`; production requires Supabase. Editing access lives in an HttpOnly browser cookie for 30 days. Anyone with a published link can view that version and leave a question. Later draft edits stay private until publication.

## AI and authorship

- Muse Spark (`muse-spark-1.3`) extracts a structured scene with verbatim source evidence. Unknown details remain unspecified. The storyteller edits and approves the result.
- Muse Image (`muse-image-1.0`) generates one image and edits selected earlier images using reviewed details and a correction. Successful versions are retained.
- The shared `imageGenerationInstruction` in `src/lib/memory/prompts.ts` applies to both generation and edits. It defaults to a candid, photorealistic camera image with natural light and lifelike textures, discourages comic/painted aesthetics, and converts stylized reference images to photographic realism during editing. The Images API accepts this direction in `prompt`, rather than a chat `system` role.
- The UI identifies generated scenes as AI reconstructions, not original photographs. Unknown facial likenesses are not promised.
- People ask and answer questions. Models do not impersonate relatives or answer autobiographical questions.
- Muse Voice Transcribe (`muse-voice-transcribe-1.0`) turns an optional 1–60 second recording into text the storyteller reviews. Recordings stay private unless explicitly included when publishing. Original recorded audio and transcript are retained separately from the edited memory.
- Up to five storyteller-positioned image pins reveal selected verbatim source excerpts and give questions a specific context.
- A scoped invitation lets one other person create their own account in the same editor before a two-perspective reveal. Muse Spark compares only the two approved public captions/pin quotes, cites each account, and caches the result. Human replies remain personally written.

The first live smoke check observed extraction in 11.6 seconds, generation in 48.0 seconds, and editing in 17.2 seconds. This is one observation, not a latency promise. Its initial artwork repeated one person across time; the edit corrected that and prompts now explicitly request one moment and each person once. Author review remains essential.

The landing image is real Muse output of a clearly fictional memory, copied from the photography smoke check in `tmp/meta-smoke/edited.webp` to `public/sample-memory.webp`. It uses the same generation and reference-edit path as the app. The correction preserves the red bicycle, warm afternoon and candid photographic realism. It was generated through Muse.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Playwright starts an isolated server on 3010 with fixtures and its own data directory; it never spends Meta credit. Test mode is prohibited in production. Install its browser with `npx playwright install chromium`.

`npm run check:meta` explicitly makes one live extraction, generation and edit, saving fictional sample assets in gitignored `tmp/meta-smoke`. `npx tsx scripts/check-storage.ts` exercises real Supabase private images, signed URLs, publishing and messages with those prepared assets. It stores the sample editing capability in gitignored `.data/live-demo.json`; never publish that file.

Verified during implementation: unit/integration tests, browser create/review/refine/share/question/reply journey, desktop/mobile visuals, real Muse generation/editing, and real Supabase uploads/downloads/publication/messages. See `docs/implementation-progress.md` for final results.

## Deployment

Vercel production needs the three required secrets, configured in its encrypted environment after explicit user approval. Keep `E2E_TEST_MODE` unset. Image routes advertise `maxDuration=300`; Meta requests time out after 240 seconds without automatic retries. Verify the deployed account's runtime limit. Optional `APP_ORIGIN` pins one exact origin; otherwise requests are checked against the current request origin.

`MAX_IMAGE_REQUESTS=24` caps all reserved image attempts across the database, including failures. This is not a dollar limit. Concurrency and reservation checks are atomic. Inspect credit before raising it. `.vercelignore` excludes local secrets, editing capabilities, fixtures, scratch files and test outputs.

Prototype limitations: browser-bound editing without account recovery, unlisted bearer links rather than verified recipient identities, variable image latency and consistency. Notifications, live-streaming transcription, animation, face matching, multiple styles, and blockchain are deferred.

See `docs/demo-script.md` and `docs/submission-draft.md` for judging materials.


## Connection features

Start with **Start with my voice instead**, or use **Record my memory** inside the editor. **Use transcript** deliberately replaces the written account and clears scene approval. Images can carry up to five optional source-linked pins under **Add details someone can discover**. Save the pins, then publish; **Include my recorded voice and its original transcript** defaults off.

After publication, **Invite another perspective** creates a neutral invitation for one additional account. The invite link grants creation/resumption of that contribution; it is not verified identity. Each person reviews and publishes their own image, then explicitly attaches that approved snapshot to the comparison. Captions, selected pins, and opted-in narration are frozen in that comparison. Later ordinary edits do not silently change it. Pin questions and human replies remain attached to the publication they refer to.

`MAX_VOICE_REQUESTS=24` and `MAX_COMPARISON_REQUESTS=24` cap persisted provider attempts separately; the existing image cap remains 24. Pages never trigger paid comparison generation on reload. Failed provider calls preserve clips, words and images; retries are explicit. These caps are attempt counts, not dollar budgets.

`npx tsx scripts/check-voice.ts <local-canonical-wav>` performs one live voice call without logging speech text. `npx tsx scripts/check-comparison.ts` performs one live comparison of two fictional captions. `npx tsx scripts/check-connections.ts [scene-json] [prepared-webp]` checks migrated Supabase persistence using prepared real art without making image-generation calls; it is not a demonstration of two newly generated perspectives. These scripts spend provider credit where explicitly noted. Local owner capabilities stay in ignored `.data` files.

The browser suite covers actual capture with a controlled microphone fixture, transcript review, opted-in audio, pins, independent contribution, comparison, contextual question/reply, and denied-microphone recovery. Live checks separately verified the real voice provider and the complete Supabase storage/reservation path. A fictional showcase uses the earlier real child-view Muse output plus a newly generated father-view image; the presenter should record their own narration rather than use synthesized or borrowed speech as a family member.


Image details use **Add a detail → click the image → write a note → Save detail**. Meta SAM 3.1 can outline the clicked object; notes can also use a simple pin. New notes are labeled as storyteller additions, while existing source quotes retain their provenance. Apply `supabase/migrations/003_detail_outlines.sql` after 001 and 002 to enable the durable SAM request budget (20 attempts per image version, 120 across the project, including failed attempts). If outlines are unavailable, note saving remains available.
