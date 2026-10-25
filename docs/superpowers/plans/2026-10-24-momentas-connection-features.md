# momentas Connection Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user permits subagents at low reasoning while the orchestrator stays at high reasoning. Establish the shared contracts first; keep edits to the shared store/types/migration under one owner.

**Goal:** Add real recorded narration, source-linked image details, and two independently authored perspectives to the working momentas demo.

**Architecture:** Extend the existing memory editor rather than creating a second generation workflow. New immutable publication snapshots bind image, selected pins, and optional narration; a capability-scoped invitation links two such snapshots. Separate voice, pin, and perspective services reuse server-only authorization and the existing local/Supabase adapters.

**Tech Stack:** Existing Next.js 16.4.3, React 19.3.1, TypeScript, Tailwind, Zod, Vitest, Playwright, Supabase REST/private Storage, Muse Spark/Image, Muse Voice Transcribe, Web Audio/MediaRecorder, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-24-momentas-connection-design.md` (read first). This is a proposed plan, not an implementation authorization or a claim of completed features. Base: `2d943fc`.

## Global constraints

- Product name is **momentas**; keep the existing photography directive and `SHARE_DOMAIN_V1` unchanged.
- Recording is optional, 1–60 seconds, canonical mono PCM16 WAV at 24,000 Hz; file max 2,880,044 bytes, complete multipart body max 3 MiB.
- Up to five pins per image, each quote a 1–500 character verbatim excerpt of a reviewed source quote, with finite normalized coordinates in `[0,1]`.
- One additional perspective per original memory. Both contributions are personally supplied and deliberately published. Invite access is bearer access, not verified identity.
- A public comparison contains exactly two frozen publication snapshots; later drafts or normal republishing do not silently replace them.
- Compare only approved captions and selected public pin quotes. Up to two shared observations, two distinct observations, and two neutral questions; require correctly attributed verbatim evidence.
- Audio sharing defaults off. No synthetic relatives/voices, inferred hidden emotions, automatic object detection, generated video, or model-written autobiographical replies.
- Preserve the current 24-image request cap. Voice and comparison requests each default to 24 persisted attempts, including failures, with explicit retries and no calls on GET/page refresh.
- Keep data/secrets private; migrate with additive `002_connection_features.sql`. Old memories, links, and messages must still work. Read installed Next.js documentation per `AGENTS.md` before implementation.

## Review focus

1. Republishing the same image with changed caption/audio/pins must invalidate a stale regular-share post even though `versionId` did not change (Tasks 1/3).
2. A lost response or concurrent invite claim must not create a second contribution or strand the editing capability (Task 4).
3. A forged narration/pin/publication ID must never sign another memory's private asset or write a message against it (Tasks 1–4).
4. A recorder which reports support but fails to decode, or returns silence, must preserve existing typed words and provide a retry/manual path (Task 2).
5. Comparison synthesis can fail, receive malicious text, or return valid-looking quotes from the wrong side; keep both approved memories usable and reject unsupported evidence (Task 5).

## File map and contracts

Extend `src/lib/memory/types.ts` and `schema.ts` with:

- `AuthorAuth = {memoryId: string; ownerToken: string}`.
- `PublicPin = {id: string; x: number; y: number; label: string; sourceQuote: string}`; `PinDraft` adds `detailPath: string` (validated `setting`, `people.N`, `details.N`, `perspective`, or `feelings.N`).
- `NarrationRecord = {id; memoryId; audioPath; durationMs; transcript: string|null; transcriptionStatus: 'idle'|'pending'|'complete'|'failed'; createdAt}`. `NarrationView` omits `audioPath` and adds a signed/authorized `audioUrl`.
- `PublicationSnapshot = {id; memoryId; versionId; title; authorName; recipientName; caption; pins: PublicPin[]; narrationId: string|null; createdAt}`. `PublicationView` adds authorized `imageUrl` and `narration: NarrationView|null`, omitting storage paths.
- `PerspectiveLink = {id; originalMemoryId; originalPublicationId; eventLabel; inviteTokenHash; comparisonTokenHash; contributionMemoryId: string|null; contributionPublicationId: string|null; synthesisStatus: 'idle'|'pending'|'complete'|'failed'; synthesis: ComparisonSynthesis|null; createdAt}`.
- `Evidence = {side: 'left'|'right'; quote: string}`. `ComparisonSynthesis = {shared: {text: string; evidence: Evidence[]}[]; distinct: {side: 'left'|'right'; text: string; evidence: Evidence[]}[]; questions: string[]}`. The schema and evidence validator enforce the limits/side rules above.
- `ComparisonSource = {publicationId: string; authorName: string; caption: string; pins: PublicPin[]}`; `ComparisonView = {left: PublicationView; right: PublicationView; synthesisStatus; synthesis; messages: MemoryMessage[]}`.

Add nullable `narrationId`/`currentPublicationId` to memory records, narration selection to drafts, publication/pin fields to messages, and publication ID/pins/optional narration to published views. Use empty/null defaults for pre-extension local records and old fixture builders. Raw records remain server-only.

New focused modules: `src/lib/server/authorization.ts`, `meta-request.ts`, `voice.ts`, `voice-service.ts`, `pins.ts`, `perspectives.ts`, `comparison.ts`; `src/lib/memory/audio.ts`, `pins.ts`, `comparison.ts`; and components `voice-recorder.tsx`, `memory-voice-player.tsx`, `memory-detail-pins.tsx`, `perspective-invitation.tsx`, `perspective-comparison.tsx`.

The existing `Store` acquires cohesive operations below; implement each in local and Supabase adapters in the task that needs it. Keep existing methods available during migration. Return views through services, not raw rows.

## Task 1: Safe publication snapshots and shared authorization (45–60 min)

**Files:** modify `types.ts`, `schema.ts`, `server/access.ts`, `server/memories.ts`, `server/local-store.ts`, `server/supabase-store.ts`; create `server/authorization.ts`, `supabase/migrations/002_connection_features.sql`, `tests/publications.test.ts`; extend `tests/access.test.ts`/`store.test.ts`/`supabase.test.ts`.

**Interfaces:**
- Export `requireAuthor(store: Store, auth: AuthorAuth): Promise<MemoryRecord>` and `requireShared(store: Store, token: string): Promise<MemoryRecord>`; make the existing service delegate to them.
- Store: `publishSnapshot(memoryId: string, input: {versionId: string; caption: string; includeNarration: boolean}): Promise<PublicationSnapshot>` and `getPublication(id: string): Promise<PublicationSnapshot|null>`.
- Extend `MemoryService.publishMemory` to accept optional `includeNarration=false`; preserve existing calls/response. Populate `PublishedMemoryView.publicationId`, `pins`, and `narration` from the current snapshot with authorized signing.
- New scoped token helpers: `perspectiveInviteToken(ownerToken, linkId)`, `perspectiveContributorToken(inviteToken, linkId)`, `perspectiveComparisonToken(contributorToken, linkId)`, all returning base64url HMAC-SHA256 values. Use new fixed `momentas:...:v1` domains; do not alter legacy share derivation.

- [ ] Write failing store/service tests proving atomic snapshot creation + current pointer update, backfill/default compatibility, cross-memory version/audio rejection, and snapshot immutability when draft/caption/pins change. Existing legacy share-token fixture must still pass.
- [ ] Run `npm test -- tests/publications.test.ts tests/access.test.ts tests/store.test.ts tests/supabase.test.ts`; observe the new behavior fail for the expected reason.
- [ ] Implement the contracts and additive tables/FKs/grants/private `memory-audio` bucket. Initially pins/narration are empty/null. Store publication and legacy fields in one RPC transaction, with cross-memory ownership constraints. Include backfill SQL for current published memories. Later tasks append to the same unpublished migration under the store owner's coordination.
- [ ] Run the targeted tests and `npm run typecheck`; require all pass. Verify two snapshots of the same image remain distinct and later updates cannot mutate the first.
- [ ] Commit this milestone. Apply/verify the migration in the designated Supabase project before deploying any code that requires it; prepare the complete SQL first. Existing service-role REST access cannot execute schema setup, so SQL Editor or a separately available migration credential is an execution checkpoint.

## Task 2: Record, transcribe, and share the real voice (75–90 min)

**Files:** create `memory/audio.ts`, `server/meta-request.ts`, `server/voice.ts`, `server/voice-service.ts`, `components/voice-recorder.tsx`, `components/memory-voice-player.tsx`; modify `server/meta.ts` only to reuse transport; extend both stores/migration, `types.ts`, `schema.ts`, `memory-app.tsx`, `globals.css`, `.env.example`; create `tests/audio.test.ts`, `tests/voice.test.ts`, `e2e/voice-memory.spec.ts`, `scripts/check-voice.ts`.

**Routes:**
- `POST /api/memories/[id]/narrations` — bounded multipart upload, author-only; saves the validated clip, returns `NarrationView` (201) before any paid transcription.
- `POST /api/memories/[id]/narrations/[narrationId]/transcribe` — JSON `{requestId}`; author-only, idempotent reservation, returns completed `NarrationView`.
- `GET /api/memories/[id]/narrations/[narrationId]/audio` — owner or validated regular-share/comparison snapshot access; no direct arbitrary-path endpoint.

**Interfaces:** `normalizeRecording(blob: Blob): Promise<Blob>`; pure `encodePcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array`; server `validateNarrationWav(bytes: Uint8Array): {durationMs: number}`; `transcribeVoice(wav: Uint8Array): Promise<{transcript: string; durationMs: number}>`; `VoiceService.upload(auth, wav)` / `transcribe(auth, narrationId, requestId)` / `getAudio(authOrPublishedCapability, narrationId)`.

Store operations: `saveNarration`, `getNarration`, `putAudio`, `readAudio`, `removeAudio`, `audioUrl` mirror image storage with strict paths and `audio/wav`; complete transcription once without replacing source audio. Add `reserveConnectionRequest(kind, resourceId, requestId, cap)` / `completeConnectionRequest(...)` / `failConnectionRequest(...)` plus `connection_requests` RPCs. Reuse these for Task 5.

- [ ] Before coding, confirm the voice model is accessible with the existing key via available model metadata; add optional `META_VOICE_MODEL=muse-voice-transcribe-1.0`, default `MAX_VOICE_REQUESTS=24`. Do not log credentials or make undocumented `/audio/transcriptions` calls. Flag denied access early; preserve recording + manual text as the labeled fallback.
- [ ] Write failing tests: PCM/header correctness at sample extrema, valid 1/60-second files, invalid format/rate/chunks/truncation/size/duration, zero-speech transcript, unchanged draft on failure, author-only asset IDs, audio unshared by default, a new draft clip cannot replace already published audio, and only one provider call for a repeated successful request ID. Stub only the external Meta HTTP boundary.
- [ ] Run `npm test -- tests/audio.test.ts tests/voice.test.ts`; verify expected failures.
- [ ] Implement browser MIME negotiation, native decode/downmix/resample, exact length trim, and WAV encoding; bounded multipart parsing with the 3 MiB cap before buffering. Stop microphone tracks and dispose AudioContexts/object URLs on stop, cancel, error, and unmount. Keep failed-upload blobs locally for retry.
- [ ] Implement upload-first persistence, transcription reservation, and the documented Meta multipart request. Use a 120-second provider timeout, no hidden retries. Empty transcript is a recoverable no-speech result, not a new story. Check returned duration against validated clip with a small documented rounding tolerance.
- [ ] Add voice-first navigation: allow empty saved draft stories, require non-empty text for extraction; **Use transcript** deliberately writes story + narration selection and invalidates scene approval. Add audio preview and off-by-default **Include my recorded voice** publication control. Sharing audio also shares its original transcript; edited story text is separately labeled.
- [ ] Run targeted tests, `npm run typecheck`, and browser tests with controlled microphone audio/permission denied. Manually rehearse the real microphone in Chrome and the intended mobile browser; if decode fails, keep typed entry available. Run `npx tsx scripts/check-voice.ts <consented-local-wav>` once when an actual consented recording is available; the script must not print its transcript.
- [ ] Commit the usable voice milestone. Playback uses a real `<audio>` element, explicit play, and an accessible transcript; no speech synthesis or word timing.

## Task 3: Version-bound quote pins and contextual human messages (60–75 min)

**Files:** create `memory/pins.ts`, `server/pins.ts`, `components/memory-detail-pins.tsx`, `tests/pins.test.ts`, `e2e/detail-pins.spec.ts`; modify `types.ts`, `schema.ts`, both stores/migration, `server/memories.ts`, message routes, `memory-app.tsx`, `globals.css`.

**Routes/interfaces:** `PUT /api/memories/[id]/versions/[versionId]/pins` with `{pins: PinDraft[]}`; `PinService.save(auth, versionId, pins): Promise<PublicPin[]>`. Store `saveVersionPins(memoryId, versionId, pins)` / `getVersionPins(memoryId, versionId)`. `resolveSceneDetail(scene: ApprovedScene, detailPath: string): SourcedDetail` admits only the enumerated paths. Public pin labels/quotes are derived and validated from that version, not trusted arbitrary payload strings.

Extend public-message input to `{versionId, publicationId, pinId: string|null, displayName, text}`. Store `addPublishedMessage(message, guard)` where guard is `{kind:'current', publicationId}` or `{kind:'comparison', linkId, publicationId}`. A new write RPC validates the current snapshot or frozen pair and pin membership under the same transaction. Copy parent publication/pin IDs onto human replies.

- [ ] Write failing tests for five/six pins, NaN/out-of-range coordinates, forged version/detail IDs, excerpt not in reviewed quote, excerpt limit, snapshot copy, empty pins on a newly edited image, same-version/new-publication stale messages, wrong pin on another publication, and legacy messages lacking pin fields.
- [ ] Run `npm test -- tests/pins.test.ts tests/publications.test.ts tests/service.test.ts`; observe expected failures.
- [ ] Implement pin persistence, source resolution, snapshot copying, and contextual message RPCs in both adapters. Validate only against stored immutable scene details, never user-submitted scene data. Preserve plain unpinned questions and human replies.
- [ ] Add choose-detail → select-excerpt → place-pin editor, responsive overlay, keyboard placement controls, and a matching accessible detail list. Render the whole image with its intrinsic aspect ratio, no object-fit cropping. Selecting a pin opens its words and prefills a question context without fabricating a message.
- [ ] Run targeted tests and `npx playwright test e2e/detail-pins.spec.ts`; require correct placement on desktop/mobile, unsent message preservation on 409, and a real typed reply attached to the pin.
- [ ] Commit the usable detail milestone.

## Task 4: A separate contribution through a bounded invitation (75–90 min)

**Files:** create `server/perspectives.ts`, `components/perspective-invitation.tsx`, `app/perspective/[token]/page.tsx`, related API routes below, `tests/perspectives.test.ts`, `e2e/perspective-invite.spec.ts`; extend stores/migration, `schema.ts`, `memory-app.tsx`, `next.config.ts`.

**Interfaces:** `PerspectiveService.createInvite(auth, eventLabel): Promise<{inviteUrl; comparisonUrl; linkId}>`; `getInvite(token): Promise<{eventLabel; inviterName; contributionExists: boolean}>`; `claim(token, authorName): Promise<{memoryId; contributorToken}>` (token set only in HttpOnly cookie); `attachContribution(auth, linkId, publicationId): Promise<{comparisonUrl}>`. Store `createOrGetPerspectiveLink(link)` / `findPerspectiveByInviteHash(hash)` / `getPerspectiveLink(id)` / `claimPerspective(linkId, candidateMemory)` / `attachPerspectivePublication(linkId, contributionMemoryId, publicationId)`.

**Routes:** `POST /api/memories/[id]/perspective` creates/returns the author-owned invitation; `GET /api/perspectives/[token]` returns neutral metadata only; `POST /api/perspectives/[token]/claim` claims/resumes; `POST /api/memories/[id]/perspective/attach` with `{linkId, publicationId}` binds that contributor's selected snapshot. New pages/API responses use private/no-store/no-referrer/noindex headers; same-origin checks protect mutations.

- [ ] Write failing tests for unpublished originals, neutral DTO without image/story/scene, atomic repeated/concurrent claim, retry after lost cookie response deriving the same contributor capability, invitation scoped to one child, denied original-memory edit with child owner cookie, private contribution not attached, and invalid/cross-memory publication attachment.
- [ ] Run `npm test -- tests/perspectives.test.ts tests/access.test.ts`; verify expected failures.
- [ ] Implement one unique link per original memory, frozen original publication, new HMAC namespaces and hashed capabilities. Atomic claim either inserts candidate child + link pointer or returns existing child; it never overwrites owner data on resume. Reconstruct the same contributor token from invite + relation ID and set the existing memory owner cookie.
- [ ] Reuse `/memory/[id]` with server-verified contribution context included in its author DTO (link ID and neutral event metadata only). Add explicit **Add this version to our comparison** after normal publication. Attachment is immutable/idempotent: same snapshot succeeds; a different attached snapshot gets 409.
- [ ] Add author invite UI and recipient capture page with a short explanation: contribute your recollection before revealing the first. Do not preload first-person text/image into the contributor's client or Muse generation request.
- [ ] Run targeted tests and `npx playwright test e2e/perspective-invite.spec.ts`; two isolated contexts must each reach their own reviewed/published image without crossing editing access.
- [ ] Commit the working invitation milestone.

## Task 5: Grounded comparison synthesis (45–60 min)

**Files:** create `memory/comparison.ts`, `server/comparison.ts`, `tests/comparison.test.ts`, `scripts/check-comparison.ts`; extend `server/perspectives.ts`, stores/migration, `.env.example`; create `POST /api/memories/[id]/perspective/synthesis` with `{linkId, requestId}`.

**Interfaces:** `buildComparisonSources(left: PublicationSnapshot, right: PublicationSnapshot): [ComparisonSource, ComparisonSource]`; `validateComparisonEvidence(sources, result: ComparisonSynthesis): void`; `comparePerspectives(sources): Promise<ComparisonSynthesis>`; `PerspectiveService.synthesize(auth, linkId, requestId): Promise<ComparisonSynthesis>`. Store completes the reserved request and persisted link result atomically for its exact two publication IDs.

- [ ] Write failing tests for shared evidence requiring both sides, distinct evidence attributed to its declared side, exact quote membership, sparse/empty valid observations, invalid/overlong arrays, injection strings treated as source data, private fields absent from provider payload, pending duplicate requests, cached reload with no provider call, and recoverable failure without loss of either snapshot.
- [ ] Run `npm test -- tests/comparison.test.ts tests/perspectives.test.ts`; observe expected failures.
- [ ] Implement a Muse Spark structured-output call through shared safe transport, default existing Spark model, 120-second timeout. Instruction: describe what the accounts say, do not adjudicate truth/infer feelings/answer biography, and return fewer findings when evidence is insufficient. Validate schema and verbatim side attribution after parsing.
- [ ] Limit generation to an authenticated owner of either linked memory, after both snapshots attach. Reserve against `MAX_COMPARISON_REQUESTS=24`. GET remains read-only; explicit retry uses a new request ID. After complete, return the saved result for the pair rather than regenerate it. Invalid evidence is a recoverable synthesis failure.
- [ ] Run tests/typecheck and one explicit live smoke check using two plainly fictional public captions/pin quotes. Never send private draft text to this comparison call. Record latency and result-validation success without printing credentials or personal content.
- [ ] Commit the comparison service milestone.

## Task 6: Reveal, voice playback, and pinned conversation (45–60 min)

**Files:** create `components/perspective-comparison.tsx`, `app/compare/[token]/page.tsx`, `GET /api/comparisons/[token]`, `POST /api/comparisons/[token]/messages`, `e2e/two-perspectives.spec.ts`; extend `server/perspectives.ts`, `globals.css`, original shared-memory UI.

**Interfaces:** `PerspectiveService.getComparison(viewToken): Promise<ComparisonView>`; `postComparisonMessage(viewToken, {side, publicationId, pinId, displayName, text}): Promise<MemoryMessage>`. Resolve published media through authorized frozen snapshots, including older snapshots which are no longer the normal current share. Do not return draft fields, editing capabilities, or storage paths.

- [ ] Write a failing browser journey: first author records/pins/publishes, second contributes/publishes/attaches, comparison reveals both views, active side voice plays and switching pauses it, quote pin opens, a question reaches the correct owner's workspace, and that owner's typed reply returns. Add waiting/failed-synthesis states with both images intact.
- [ ] Run `npx playwright test e2e/two-perspectives.spec.ts`; observe the missing flow fail before implementing it.
- [ ] Implement labeled reveal + perspective tabs, desktop side-by-side and mobile stack. Show two small AI observation groups with clickable source quotes and neutral question starters. Honor reduced motion; any gentle camera pan is optional and disabled during pin interaction. Show original transcript with voice playback; never autoplay or play both narrators at once.
- [ ] Use the comparison message guard from Task 3. Reject wrong-side pin/publication IDs; keep frozen conversation working after later ordinary republishing. Author replies continue through the existing human reply endpoint.
- [ ] Run the journey plus desktop/mobile checks, keyboard navigation, and both existing sharing E2Es. Verify no layout overflow, unintended audio, or console errors. Commit the integrated reveal.

## Task 7: Release checks and judging rehearsal (60–90 min reserved)

**Files:** update `docs/demo-script.md`, `docs/submission-draft.md`, `docs/implementation-progress.md`, `README.md`; final extension migration plus `.env.example` remain in source. Keep real recordings and browser capability state in gitignored local directories.

- [ ] Self-review the final migration and ensure tables/bucket/RPC permissions match the existing service-role-only model. Apply it once in the correct project and verify old records, current share-token fixture, private audio/pins, and atomic reservation behavior against real Supabase. Do not reset tables or wipe existing data.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build`; require all green. Log any limitation by name instead of suppressing a failing check. Run the real Voice and comparison smoke scripts once, not on every test pass.
- [ ] Check stage/production target identity before deploy; keep existing credentials/caps and inspect image attempt headroom before preparing a pair. Deploy to the existing momentas Vercel project. Verify anonymous public access, both frozen images/audio, ordinary share compatibility, cookie isolation, and an actual pinned human exchange on the hosted app.
- [ ] Prepare one polished, explicitly fictional pair with real Muse images and two recordings made by the presenter playing labeled roles. Use saved genuine results for the reveal; transparently distinguish saved outputs from a short live voice transcription. Keep a labeled screen recording as a backup for network latency.
- [ ] Rehearse a 2–3 minute story: problem → a short spoken account/transcript review → photographic reconstruction → reveal the other account → hear their voice → open a quote pin → ask and answer one real question. End on the insight that conversation adds to the memory.
- [ ] Update exact verified feature claims and implementation assistance in judging materials, scan staged files for secrets/capabilities/recordings, commit and push source, then present the final URLs and remaining limitations. Submission/credit redemption/terms acceptance are not part of this plan.

## Execution and fallback policy

Tasks 1–6 target about 7–8 working hours; protect the Task 7 reserve. Prefer sequential backend contracts under one owner; after those contracts are stable, voice and pin UI work may use low-reasoning subagents in distinct files. The high-reasoning orchestrator owns integration and verification. Do not edit shared types/migrations concurrently.

Checkpoint after each milestone: keep the original flow working and keep new optional features independently usable. Cut camera pan, waveform decoration, and elaborate pin repositioning before cutting the three core features. If Voice access is blocked, recorded audio plus manually entered text is a valid labeled fallback; it is not a successful Muse transcription. If synthesis fails, the two human accounts still reveal and play with a retry control. If time forces less scope than the selected features, report the tradeoff rather than silently claiming completion.

## Plan self-review

Coverage: voice capture/storage/transcript/publication (Task 2); detail evidence/placement/conversation (Task 3); private input and contribution ownership (Task 4); approved-text comparison/caching (Task 5); integrated reveal/audio/contextual replies (Task 6); legacy compatibility, live services, and solo demo (Tasks 1/7). Review-focus cases each have a named owning test above. Product code and dependencies remain untouched during this planning task.
