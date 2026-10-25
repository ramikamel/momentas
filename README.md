# momentas

**Let me show you how I remember it.**

[Try momentas](https://momentas.tech) · [Source code](https://github.com/ramikamel/momentas)

A photograph captures what was in the frame. momentas helps people share what it felt like to be there. Built for HackTX’s Meta track, it turns personal stories into visual memories that spark real conversations between family and friends.

## What you can do

- **Recreate a memory:** write or record your story, then generate a realistic image of the moment. Add named reference photos to personalize people, places, or objects.
- **See outside the frame:** upload an existing photograph, share the story around it, and explore an AI reconstruction of what the camera missed.
- **Make details discoverable:** select outlined objects and add personal notes.
- **Share another perspective:** publish your memory, invite someone who was there, and see both perspectives side by side. Shared memories also support human questions, replies, and optional original voice recordings.
- **Keep your versions:** revisit saved pictures and refine an earlier image without losing it.

## Meta APIs used

- **Muse Spark** (`muse-spark-1.3`) interprets stories, extracts scene details, asks contextual questions about uploaded photos, and identifies objects for selection.
- **Muse Image** (`muse-image-1.0`) generates and revises photographic memory reconstructions, using named reference images when supplied.
- **Muse Voice Transcribe** (`muse-voice-transcribe-1.0`) turns recorded memories into editable story text.
- **Meta SAM 3.1** (`sam-3.1`) produces selectable object outlines for image details.

AI reconstructions are labeled separately from original photographs. People control what they publish, and questions and replies are written by real people. Generated images express a remembered perspective; they are not historical evidence or a guarantee of exact likeness.

## Run locally

Requires Node.js 22+.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `MODEL_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Keep all three server-side; never use a `NEXT_PUBLIC_` prefix for secrets.

For a fresh Supabase project, run the SQL files in `supabase/migrations/` in numerical order, from `001_memories.sql` through `007_recording_recovery.sql`, using the Supabase SQL Editor. Existing installations should apply only migrations they have not already run. These configure private storage, memory versions, sharing, recordings, and photo context. The service-role REST key cannot execute these schema migrations.

Open [localhost:3000](http://localhost:3000). Local development can use the file-backed store without Supabase; production requires Supabase. Editing access is stored in an HttpOnly browser cookie. Saved pictures belong to that browser; published and invitation links grant scoped access to their holders.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build -- --webpack
```

Install the browser test runtime with `npx playwright install chromium`. Playwright uses an isolated fixture server and does not spend model credits. Never enable `E2E_TEST_MODE` in production.

## Deployment and limitations

Hosted on Vercel at [momentas.tech](https://momentas.tech). Configure the same three server environment variables before deploying. Keep local credentials, `.data`, and editing capabilities out of Git.

This hackathon prototype uses browser-bound editing and unlisted sharing links rather than account recovery or verified recipient identities. Image generation latency, facial likeness, and object outlines can vary. Later drafts remain private until published; comparisons preserve the versions people chose to share.
