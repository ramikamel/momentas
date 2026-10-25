# momenta

Let me show you how I remember it.

Live app: https://momenta-hacktx.vercel.app

Source: https://github.com/ramikamel/momenta

Write a memory, review its source-linked scene details, create and refine a storybook illustration with Meta's Muse APIs, then share the approved version and exchange human questions and replies.

## Local setup

Requires Node.js 22+. Verified locally with Node 26.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configure `MODEL_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (an existing `.env` works). Supabase accepts a project-root URL or its `/rest/v1` endpoint. Use the server-side secret/service-role key; never expose it with a `NEXT_PUBLIC_` prefix.

Run `supabase/migrations/001_memories.sql` once in the new project's SQL Editor. It creates private tables, atomic render/message RPCs and the private `memory-images` bucket. The REST service key cannot execute schema SQL.

Open http://localhost:3000. Without Supabase credentials, development persists in `.data`; production requires Supabase. Editing access lives in an HttpOnly browser cookie for 30 days. Anyone with a published link can view that version and leave a question. Later draft edits stay private until publication.

## AI and authorship

- Muse Spark (`muse-spark-1.3`) extracts a structured scene with verbatim source evidence. Unknown details remain unspecified. The storyteller edits and approves the result.
- Muse Image (`muse-image-1.0`) generates one image and edits selected earlier images using reviewed details and a correction. Successful versions are retained.
- People ask and answer questions. Models do not impersonate relatives or answer autobiographical questions.
- Voice input is deferred. Typed input supports the complete MVP.

The first live smoke check observed extraction in 11.6 seconds, generation in 48.0 seconds, and editing in 17.2 seconds. This is one observation, not a latency promise. Its initial artwork repeated one person across time; the edit corrected that and prompts now explicitly request one moment and each person once. Author review remains essential.

The landing illustration is real Muse output of a clearly fictional memory, copied from `tmp/meta-smoke/edited.webp` to `public/sample-memory.webp`. Final correction: "Make the parking lot feel much bigger, and put Dad farther behind the child. Preserve the red bicycle, the warm afternoon, and the storybook style." It was generated through Muse, not the built-in image tool.

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

Prototype limitations: browser-bound editing without account recovery, unlisted bearer links rather than verified recipient identities, variable image latency and consistency. Notifications, streaming voice, animation, face matching, multiple styles, two-perspective comparisons and blockchain are deferred.

See `docs/demo-script.md` and `docs/submission-draft.md` for judging materials.
