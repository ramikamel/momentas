# Interactive Photo Memories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. This is a proposed plan; do not execute until the user authorizes starting.

**Goal:** Turn a real photograph into an explorable collection of the storyteller's own memories, with a gentle interview and an optional outside-the-frame reveal.

**Architecture:** Preserve one immutable source upload and a display version; reuse cached object maps, authored pins and actual narration. Cache question-only prompts for the source and let one contextual composer collect text/voice. Keep outside-frame output as a separate generated version with protected source bounds and explicit publication assets.

**Tech stack:** Existing Next.js 16.4.3, React 19, TypeScript, Zod, Supabase private storage/Postgres, Muse Spark/Image/Voice, SAM 3.1, Sharp, Vitest and Playwright. No new animation framework or video pipeline.

**Spec:** docs/superpowers/specs/2026-10-25-photo-exploration-design.md

## Global constraints

- Planning only until the user approves execution. No deployment in the planning phase.
- One source photograph, at most three initial questions and five authored notes per image version.
- Metadata fields optional; same-page recording, automatic transcription, one active composer.
- AI asks questions or visualizes supplied recollections; it never writes the person's life story or invents identities/emotions.
- Original bytes/hash retained; optimized display asset is separate; generated pixels never replace source content.
- Named references remain private visual guides, separate from the main source photograph.
- Keep all current story-first, library, generated-version, publication, human-reply and comparison flows working.
- Use existing owner-capability security and immutable publication snapshots. Preserve legacy token derivation.
- GET does not trigger model calls. Paid jobs use atomic claims/reservations, cached results and explicit retry.
- Add migration005 after the unfinished migration004 foundation is validated. Do not modify applied migrations001–003.

## Review focus

1. Context changes or typing during transcription must not lose words, append them twice or attach them to the wrong object.
2. A helmet inside a person mask must remain independently selectable on desktop, touch and keyboard; incorrect selection is recoverable.
3. Large/oriented/invalid uploads, failed completion and concurrent duplicate source uploads must preserve the prior memory and private storage rules.
4. Reopening a photo or losing a completed response must not repeat paid questions, object preparation or expansion.
5. Shared originals/expansions must use frozen authorized assets and correct labels; raw originals/references and unpublished answers must remain private.

## Delivery order and stop points

- **Foundation:** finish the existing personalization checkout and verify it. Provisional estimate 1–2 focused hours; reassess after reviewing the paused diff.
- **Feasibility gate:** time-box a real outside-frame test to 30–45 minutes before committing to a seamless expansion effect.
- **Complete core:** source upload + interactive photo + gentle interview + recipient exploration, approximately 3–5 hours after foundation.
- **Optional finale:** Task6 starts only after Tasks0–5 pass the core acceptance journey and the spike succeeds; approximately 2–3 hours then. If the spike fails, use the existing source-backed generation path for a clearly labeled side-by-side reconstruction; do not build protected-canvas expansion infrastructure just for the fallback.
- Estimates are planning ranges, not a guaranteed deadline. If time runs short, preserve a polished explorable-photo experience and use a clearly labeled prepared wider reconstruction. Do not cut privacy, source preservation or reliable voice behavior.

### Task 0: Integrate the existing personalization foundation

**Files:** Current uncommitted work under /private/tmp/momentas-personal: VoiceRecorder, ReferencePhotos, DetailPinEditor, object-map/segmentation/references services, shared personalization types, stores, migration004, memory-app and provider changes.

**Interfaces:** Keep references(mid), get/claim/saveObjectMap and outline batch reservations from the existing checkout. Actual region endpoint is /versions/:versionId/objects, not the external plan's /regions. Reference inputs must reach Muse as real image bytes, with ordered labels.

- [ ] Review the diff and run typecheck/lint/unit tests; add browser coverage for blank-metadata record→stop→automatic story insertion, concurrent typing, failed ASR retry and typed-text preservation.
- [ ] Add reference-provider tests that assert actual photo bytes/labels reach generation and editing, and source-reference snapshots remain private.
- [ ] Validate migration004 locally, including owner constraints, duplicate names/max4, atomic cache claim, expired-job handling and six-attempt reservations. Obtain the user's schema application only after the final SQL is reviewable.
- [ ] Run a real helmet concept selection and one real labeled-reference render; inspect outputs and preserve ignored artifacts. Review integration before committing this foundation.

### Task 1: De-risk the outside-frame effect

**Files:** Create ignored scripts/artifacts under .superpowers/photo-spike and output/photo-spike; record findings in the design/ledger. No product route yet.

**Interface:** spike(sourceDisplay, authoredOutsideFrameText) → candidate raster + sourceRect + visual findings. No unsupported mask parameter.

- [ ] After execution approval, use one labeled fictional photo and explicit off-frame recollection in a Muse reference edit. Test a wider padded-canvas composition.
- [ ] Overlay the unchanged source raster within the recorded sourceRect; inspect seams, scale, perspective, preserved people and whether added details follow the account.
- [ ] Confirm before/after source-raster equality. Evaluate one portrait and mobile reveal layout using the saved result without extra model calls.
- [ ] Record a go/no-go: acceptable expansion proceeds to Task6; poor alignment uses side-by-side wider reconstruction with honest labeling. Do not claim masked outpainting support.

### Task 2: Preserve and open a source photograph

**Files:** Modify memory/types.ts, server/local-store.ts, server/supabase-store.ts and version field mapping; create server/source-photo.ts, migration005_source_photograph.sql (source assets, upload lifecycle, private context drafts and narration-insertion keys) and owner /source/init, /source/complete and /source/image routes; tests/source-photo.test.ts.

**Interfaces:** ImageVersion.origin source|generated (legacy defaults generated). SourcePhoto {id,memoryId,versionId,originalPath,displayPath,mimeType,sha256,width,height}. SourcePhotoService.initiate(auth,file metadata), complete(auth,uploadId), getDisplay(auth). Store atomically completes at most one source per memory and writes its source version.

- [ ] Write failing tests for owner-only initiation/read/completion, immutable hash, retained original bytes, separate stripped/resized display copy, duplicate completion replay and concurrent second-source rejection.
- [ ] Implement owner-issued signed upload to a private source bucket (12MiB/MIME restrictions), then server-side completion validation (JPEG/PNG/WebP,24MP,no animation), display variant creation and transactional metadata/version save. Cleanup failed/orphaned uploads safely.
- [ ] Add origin source to the display version without using a fake scene approval as proof of authored narrative. Empty scene is structural only; allow free authored notes without extracted details.
- [ ] Model pending-upload/validating/ready/failed states with an owner upload ID and expiring completion claim. Reuse verified assets after a failed metadata commit; competing completions must never remove the accepted source. Cleanup only failed/expired unadopted assets after a grace period and a reference check. Test display-write success followed by DB failure, duplicate completion, abandoned upload and concurrent loser cleanup.
- [ ] Test wrong types, byte/pixel limits, EXIF orientation, malformed/unfinished uploads and strangers. Validate migration005 in the PostgreSQL-compatible harness. Do not apply schema during planning.

### Task 3: Build the explorable photo canvas

**Files:** Create components/photo-memory-canvas.tsx and photo-memory.css; reuse/refine detail-pin-editor.tsx and detail-outline.tsx; integrate landing/workspace in memory-app.tsx; e2e/photo-first.spec.ts.

**Interfaces:** Canvas consumes source version, ObjectMap, authored notes and selected context. onSelectObject(objectId), onChangeTarget(objectId), onOpenStory() preserve context drafts. View mode author|recipient controls available actions.

- [ ] Add a failing browser journey: Start with a photograph works without metadata; original appears before model work; source can be completed/shared without reconstruction.
- [ ] Add cached mask preparation/status, subtle first-use hint, hover/tap focus, named object buttons and small-mask priority. Show selected detail card alongside/below the photo.
- [ ] Test helmet vs wearer, object-name refinement, manual fallback, changing a note's target, switching between contexts without losing text, failed analysis and keyboard/touch use.
- [ ] Reuse private gallery/history with source-aware captions and direct source selection. Remove any hardcoded AI reconstruction label from a source view; do not relabel generated legacy assets.

### Task 4: Gentle prompts and one contextual composer

**Files:** Create server/photo-questions.ts, owner /source/questions route, components/memory-interview.tsx and memory-composer.tsx; refine voice-recorder.tsx integration; tests/photo-questions.test.ts and e2e/photo-first.spec.ts.

**Interfaces:** PhotoQuestion {id,text,regionId?}; QuestionsResult {sourceVersionId,status,questions}. Cache max3 questions per immutable source. ComposerTarget story|{regionId,noteId}; capture start freezes that target through transcription completion. Broad questions open story; object-specific questions restore/create a stable note UUID bound to that object. Note text, story text and narration remain authored. Private context drafts are keyed by (memoryId,sourceVersionId,story|note:<uuid>) with revision/text/regionId/question progress/narration association. An atomic insertion record keyed by narrationId and context prevents duplicate insertion; the photo-first story record updates memories.story in the same transaction for compatibility.

- [ ] Write failing tests that questions are cached, statements/names/invented narration are not written into story, and GET/refresh causes no paid request.
- [ ] Implement one visible prompt at a time with Answer/Skip/Done controls. Use neutral fixed questions as a no-AI fallback. Model failure never blocks recording or editing.
- [ ] Mount one composer for the active context. Record starts immediately; Stop automatically transcribes/appends once; preserve text typed while waiting, clip playback, explicit failure retry and uploaded-clip reuse. No second transcript editor or Use step.
- [ ] Persist per-context draft text and prompt progress in owner-only storage. Reuse an uploaded narration when transcription resumes; duplicate ASR/apply responses must not insert text twice. Keep draft notes distinct from committed pins/publication. Test revision conflicts, switching contexts, frozen recording target, lost response, retry, permission denial and refresh. Publishing does not silently include recordings.

### Task 5: Deliver a complete shared photo memory

**Files:** Modify publication/connections types, publication authorization, both stores, shared-memory renderer, comparison renderer and saved-picture labels; tests/source-photo.test.ts and e2e/photo-first.spec.ts.

**Interfaces:** Publication snapshots optionally name a source display asset and selected expansion asset; server verifies both belong to the same memory. Existing snapshot shape remains valid. No owner/raw-original/reference paths reach public data.

- [ ] Publish only explicitly selected source notes/caption/narration; recipient explores detail cards and can send a human question.
- [ ] Test that editing source notes or story after publishing does not mutate the shared snapshot, and that anonymous or unrelated capabilities cannot fetch full-resolution source, references or unpublished expansion.
- [ ] Inspect desktop/mobile exploration, long notes, missing audio, slow masks and reduced motion. This is the complete core milestone even if outside-frame generation is deferred.

### Task 6: Generate and reveal remembered surroundings

**Files:** Create server/outside-frame.ts, owner /source/expand route and components/outside-frame-reveal.tsx; extend generation/version metadata and provider prompts; tests/outside-frame.test.ts and e2e/photo-first.spec.ts.

**Interfaces:** ExpansionInput {requestId,sourceVersionId,outsideFrameText}; ExpansionResult {version,sourceRect,sourceVersionId,mode:expanded|wider-reconstruction}. Parent version is the source. Persist a frozen prompt/input snapshot and normalized sourceRect for consistent reload/export/share.

- [ ] Require an actual off-frame recollection and explicit Generate action; do not fabricate autobiographical details or generate on page load.
- [ ] Reserve before model work, pass the real source first and relevant named references afterward, and reuse completed request IDs. Preserve pending/failed/expired recovery and the existing no-24-image-cap behavior.
- [ ] Build the approved spike approach: source remains an independent protected layer; flattened output composites that display raster back into its rectangle. Test source pixel equality, orientation and rectangle scaling across viewport sizes.
- [ ] Keep original usable during generation and on failure. Offer Original/Beyond the frame and a short zoom-out reveal; reduced motion uses an immediate toggle. If spike failed, use an explicitly labeled side-by-side wider reconstruction.
- [ ] Keep source-relative note coordinates. Map x/y and SVG masks through persisted sourceRect for expansion; in wider-reconstruction mode keep notes on the source only. Test a helmet note at portrait/landscape/mobile aspect ratios and after reload.
- [ ] Publish/reopen the exact selected source/expanded snapshot, never an unapproved latest render. Test duplicate request, response loss, failed generation, stale source ID and unauthorized asset access.

### Task 7: Polish and rehearse

- [ ] Run lint, TypeScript, unit/integration suite, production build and existing plus new browser journeys. Fresh review of privacy/source preservation, context capture and paid-call replay before integration.
- [ ] Verify one real upload, voice insertion, helmet selection, question cache and outside-frame generation. Inspect actual images rather than relying on successful API responses.
- [ ] Rehearse a solo two-browser demo: upload photo→tap helmet→record a human sentence→explore two saved stories→reveal prepared wider scene→recipient asks a question. Identify fictional sample/prepared generation honestly.
- [ ] Preserve screenshots, timings, private capability state and generated samples outside Git. User reviews the experience and execution results before any newly requested publication step; current request authorizes planning only.

## Initial solo demo script

0:00–0:20 — “A photograph keeps what was inside the frame. It doesn't keep everything we remember.” Upload/show a clearly labeled sample original.

0:20–0:50 — Tap the helmet; tell one personal sample detail using actual recorded voice; stop and show automatic insertion once. Save the small story.

0:50–1:15 — Show another prompt; answer briefly or skip. Switch to recipient preview and discover the object stories.

1:15–1:45 — “I also remember what was happening beyond this picture.” Reveal the prepared AI wider scene with its reconstruction label; toggle back to the original.

1:45–2:00 — Ask a real question from the recipient browser. Close on the human story, not generation settings.

## Plan review

Fresh builder review completed. Corrected all five identified gaps: question-to-composer mapping, source-coordinate transforms, owner-private context persistence and narration deduplication, upload compensation/cleanup, and the core-before-expansion cut line. No further user-only decision was required to make the proposed design implementable. Execution remains awaiting user authorization.
