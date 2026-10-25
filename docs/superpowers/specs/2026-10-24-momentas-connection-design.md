# momentas: voices, details, and two perspectives

Status: proposed extension; planning only. The user selected all three ideas and confirmed more than eight working hours remain. This document and its companion implementation plan are reviewable proposals, not a claim that the features exist. Base commit: `2d943fc`.

## Intent and success

Make momentas a place to discover something about another person through a shared memory. One person records or writes an account, reviews a realistic AI reconstruction, and shares meaningful details. A second person contributes their own account before the comparison reveals the two perspectives. Both can hear the real narrators and ask questions about specific details.

The judging moment: Alex remembers an enormous parking lot and the fear of riding alone; Dad describes what he noticed while letting go. Both accounts are explicitly supplied by the presenter playing two fictional roles. The app shows their two scenes, real recorded narration, and a sourced observation that starts a human conversation. The model never writes Dad's autobiographical account or reply.

Keep the existing Next.js/React/TypeScript/Tailwind, Muse, Supabase, and Vercel architecture. Preserve the photography directive, saved image versions, browser-bound editing capabilities, current share links, and human replies. No new account system is required.

## Approaches and recommendation

1. **Extend the existing editor and publication flow (recommended).** Treat the second perspective as another normal memory, joined through an invitation. Add optional narration and selected detail pins to publication snapshots. Reuses the working review/render/refine flow and delivers useful milestones independently.
2. **Build a live collaborative memory room.** Simultaneous recording, presence, streaming transcription, and shared image editing would add synchronization and ownership work. Leave this outside the hackathon scope.
3. **Build a cinematic memory film first.** Animation, generated voices, automatic object localization, and shot sequences would put the effort into media generation. Use actual voices with a light presentation treatment instead.

The user chose the feature set; approach 1 and the exact limits below are builder recommendations for review. This is one integrated extension with three milestones, rather than three new applications.

## Experience

### Voice capture and playback

- Offer text or voice entry. A voice-first action creates a private empty draft after title/names are supplied, then opens recording inside the existing workspace. Saving an empty story is allowed; extraction still requires non-empty text. A blank draft cannot generate a scene.
- Record 1–60 seconds with start, stop, timer, playback, discard, and retry. A cancelled/failed recording never replaces existing words or a saved narration.
- Negotiate a browser-supported recording format. After stop, decode locally, downmix and resample with Web Audio, then encode mono PCM16 RIFF/WAV at 24,000 Hz. Trim at exactly 60 seconds. The maximum encoded clip is 2,880,044 bytes; cap the complete upload at 3 MiB. No server ffmpeg dependency.
- The server validates the actual WAV header/chunks, frame count, and byte size, not the client filename, MIME, or claimed duration. Accept only the canonical PCM format above; reject malformed, empty, overlong, or unsupported files before provider/storage calls.
- Muse Voice Transcribe returns an editable transcript. The person deliberately chooses **Use transcript** to replace their draft text; this clears scene approval. Preserve the original recording and transcription separately from the edited story. Do not claim edited text is an exact audio transcript.
- The original audio is stored privately. **Include my recorded voice** defaults off at publication and is previewed before sharing. Playback starts only after a user gesture. Switching perspectives pauses the other track. Text/transcript remains accessible without playback.
- Use post-recording transcription, not live WebSockets. Permission denial, unsupported recording/decoding, silence, provider errors, and timeouts leave typed entry available. A saved clip can be retried without recording again.

Verified external API contract, 2026-10-24: Meta documents `POST https://api.meta.ai/v1/asr/transcribe`, multipart `request` JSON plus `audio`; model `muse-voice-transcribe-1.0`, `audioEncoding: WAV`, `mode: PUSH_TO_TALK`, `Accept: application/json`. Supported files are mono PCM16 WAV at 16 or 24 kHz. The response supplies `transcript` and `audioDurationMs`; word-level timestamps are unavailable. See [speech-to-text](https://dev.meta.ai/docs/speech-to-text) and [API reference](https://dev.meta.ai/docs/api-reference/voice/transcribe). Do not invent word-level highlighting or accept arbitrary WebM as WAV.

### Explore a detail and start a conversation

- Allow up to five optional pins on a selected saved image. The storyteller chooses a reviewed scene detail, selects a verbatim excerpt of its stored source quote (1–500 characters), and places a pin by clicking/tapping the image. The reviewed detail is the label; the excerpt is the public quote.
- Placement is manual and approved by the storyteller. AI already organizes the supplied scene details; no object-detection/localization service is needed or implied.
- Store normalized `x`/`y` coordinates in `[0,1]`, relative to the displayed image content. Render without cropping, so desktop/mobile pins remain over the same details. Keyboard users can select a detail from an equivalent list; positioning controls allow keyboard adjustment.
- Pins are drafts until publication. Publication copies the selected pins into an immutable snapshot. An image edit starts with no pins on the new version: pins are never copied automatically onto changed composition.
- A recipient opens a pin to see the person's selected words and **Ask about this detail**. The normal human message/reply flow is retained, with optional `publicationId` and `pinId` context. Validate pin ownership and publication on the server. Reject a stale publication with a refresh prompt while preserving the unsent message.
- Public responses expose only selected published excerpts, not the entire scene plan or raw story. Old messages with no pin/publication fields still render.

### Same moment, two memories

- An author with a published memory selects **Invite another perspective**. Supply a neutral event label (max 120 characters). The invite page reveals that label and inviter display name, not the first account, image, private draft, or source scene.
- One invitation joins exactly one additional memory. The invite link is a capability to create/resume that contribution, not a verified personal identity. Claiming is atomic and idempotent; concurrent or repeated claims return the same contribution rather than creating more memories.
- The invited person uses the existing editor: type/record, review, generate, refine, add pins, and choose narration. The second image is generated from that person's account only, without the first person's image/text as conditioning. Do not promise visual identity matching between independently generated people.
- The invite encourages writing before viewing the first account; it cannot prove someone has never seen it elsewhere. Once the contribution is published, **Add this version to our comparison** explicitly confirms what will be shared. Never make a private draft visible automatically.
- The comparison opens only when both approved publication snapshots are attached. Use two labeled views, with a deliberate reveal and a perspective switcher; desktop can show both side by side, mobile stacks them. Do not imply two different viewpoints are pixel-aligned photographs with an image-difference slider.
- Each side offers its own audio and pins. Muse Spark summarizes only the published captions and selected pin quotes, not raw draft stories, unpublished scene fields, or private recordings. If those inputs are sparse, return fewer observations rather than inventing common ground.
- Structured output: up to two shared observations, two details mentioned by just one account, and two neutral questions. Shared observations require a verbatim quote from each side; a distinct observation requires a quote from its named side. Validate every quotation against the corresponding approved public text. Attribute observations to the accounts, never declare which memory is true, score accuracy, diagnose emotions, or resolve disagreement.
- Generate/cache the synthesis once per exact pair of publication IDs, with an explicit retry after failure. Image and audio remain usable if synthesis fails. Reopening the comparison makes no new model call.
- The invited person can ask a question attached to a pin on the other side. Comparison message posting authorizes only the two frozen publications, even when the original author's latest regular share page has since changed.

## Publication and data design

Add additive migration `supabase/migrations/002_connection_features.sql`; do not rewrite the deployed `001` migration. New tables use the existing server-only service-role access model and private storage.

- `memory_publications`: immutable UUID ID, memory/version IDs, published title/name/recipient/caption, selected pin snapshots, optional narration ID, creation time. `memories.current_publication_id` points at the current snapshot. Backfill one snapshot for each already published memory. Keep existing published columns and token derivation compatible. Publishing atomically inserts a snapshot and updates the current pointer/legacy fields.
- `memory_narrations`: UUID ID, memory ID, immutable private audio path and duration in ms, nullable original transcript, transcription status, creation time. Upload and transcription are separate operations so the clip survives a provider failure; a completed original transcript is not overwritten. Sharing audio also shares that original transcript, previewed with the audio checkbox. Add `memories.narration_id` as the private draft selection. Audio goes in private `memory-audio` storage with server-controlled paths and signed reads.
- `memory_version_pins`: memory/version composite ownership plus a draft JSON pin array. A pin has `{id, x, y, detailPath, label, sourceQuote}`; `detailPath` addresses the immutable `version.scene.plan` field/index. Require the chosen excerpt to be contained in that detail's stored source quote. Snapshot copies decouple later pin edits from public data.
- `perspective_links`: UUID ID, original memory ID, frozen original publication ID, neutral event label, hashed invitation/comparison capabilities, optional contribution memory/publication IDs, synthesis status/result, timestamps. Unique original memory ID limits the hackathon to one invitation/contribution per original memory. Reopening returns the existing invitation/comparison.
- Extend `messages` with nullable `publication_id` and `pin_id`. Enforce same-memory/version/publication ownership in the write RPC; validate JSON pin membership server-side and in the transaction where publication races matter. Bind replies to the parent's publication and pin. Regular share posts require the current publication; comparison posts require membership in the exact frozen pair.
- All referenced audio, pins, and versions must belong to the publication's memory. Do not let arbitrary IDs sign private storage URLs. Signed playback is granted only for an authenticated owner or a snapshot authorized by the regular share/comparison capability.
- Local persistence gets equivalent optional fields, transaction behavior, and empty defaults so existing data and fixture tests remain readable. Production still uses Supabase.

Comparison copies freeze already approved data: republishing a normal memory does not silently rewrite the paired comparison. Explain this at the confirmation step. Updated comparisons/revocation are deferred; do not offer an inoperative update/revoke control. Avoid claiming expiration/revocation of already-issued signed URLs.

### Capabilities and retry behavior

Preserve `SHARE_DOMAIN_V1` exactly. Use new scoped HMAC derivation domains for invitations, contributor editing, and comparison viewing. For a relation ID, derive invitation from original author capability, contributor capability from invitation, and comparison capability from contributor capability. Store hashes, never raw capabilities. This lets invite claims recover the same contributor cookie on retries without generating another contributor record; the original author can reconstruct their invite/comparison URLs. The invitation grants editing of that one contribution, not editing of the original memory. A comparison token grants viewing and messages, not editing/generation.

An invitation holder can resume its contribution; this is deliberate bearer access, not a single-use identity verification. Existing browser-only ownership limitations remain. Both accounts must be personally supplied; a solo presenter may transparently play both roles.

### Provider cost and concurrency

Keep `MAX_IMAGE_REQUESTS=24` and existing atomic reservations across all memories, including contributions. Never raise it silently. Add `connection_requests` for persisted request IDs, kind, resource ID, pending/complete/failed status and expiry; its RPC reserves atomically across provider calls. Add `MAX_VOICE_REQUESTS=24` and `MAX_COMPARISON_REQUESTS=24` with persisted atomic reservations and per-resource single pending request. Completed idempotent attempts return their saved result; failed attempts consume a reservation and retry only on an explicit new request. These are request caps, not dollar budgets. Reserve before a paid provider call, and retain input after errors. No new credentials are required if the existing Meta key has Voice access; confirm access in the first implementation checkpoint.

## Service/UI boundaries

Keep the memory editor; add focused `voice-recorder.tsx`, `memory-voice-player.tsx`, `memory-detail-pins.tsx`, `perspective-invitation.tsx`, and `perspective-comparison.tsx`. Share authorization helpers between the original memory service and new `VoiceService`, `PinService`, and `PerspectiveService`, rather than duplicating auth logic or growing the 1,000-line component further.

Add invite `/perspective/[token]` and comparison `/compare/[token]` pages with the same private/no-store/no-referrer/noindex policy as memory shares. Keep bearer tokens out of logs, analytics, screenshots of configuration, committed fixtures, and response error bodies.

## Delivery order and schedule

Working estimate: 7–8 hours of implementation plus 1–2 hours for integration, deployment, and rehearsal. These are planning estimates, not a deadline guarantee.

1. 30-minute audio contract/access check and publication/access contracts.
2. 45–60 minutes: additive persistence and snapshot publishing.
3. 75–90 minutes: record/transcribe/review/playback and sharing choice.
4. 60–75 minutes: version-bound detail pins and contextual messages.
5. 75–90 minutes: invitation/contribution flow using the existing editor.
6. 60–75 minutes: grounded comparison synthesis and the two-view reveal.
7. 60–90 minutes: integrated browser testing, hosted checks, prepared fictional demo, and rehearsal.

Priority is a complete working flow, not polishing one feature while another is missing. If time tightens, cut camera-pan animation, live waveforms, visual pin-placement polish, and extra comparison observations first. Keep voice recording/playback, basic quote pins, two authored perspectives, and the human exchange. If Voice access is unavailable, preserve actual recorded playback with manual text entry and report transcription as unavailable; do not present this fallback as Muse transcription.

## Verification and demo acceptance

- Existing 27 tests and original browser journey remain green. Old shared links and stored memories load after migration.
- Audio: microphone denied/unsupported, clip cancel, silence, malformed WAV, duration/size boundaries, retry/idempotency, edited transcript, and default-private audio. Unshared clips cannot be accessed through a share/comparison token.
- Pins: sourced excerpts only, normalized bounds/NaN rejection, different image versions, forged IDs, keyboard/touch access, stale publication even when the image version is unchanged, and historical replies.
- Perspectives: no first-account payload before reveal; repeated/concurrent claims create exactly one contribution; comparison stays unavailable while contribution is private; each owner cannot edit the other memory with their ordinary owner cookie; bearer invite permissions match the documented scope.
- Synthesis: only approved public inputs, verbatim correctly attributed evidence, valid sparse output, prompt-injection-resistant structured responses, explicit retry after failure, no duplicate paid calls, and stable results across refresh and later draft/publication edits.
- End to end: author records/reviews/generates/pins/publishes; second browser contributes/publishes; reveal plays actual audio and shows both perspectives; pin question receives a human reply; unauthenticated draft access stays denied. Run desktop/mobile and an actual microphone rehearsal, plus one real Muse Voice and comparison smoke check.
- Solo 2–3 minute demo: start with prepared real fictional outputs; briefly record a new sentence, show its transcript review, reveal the two perspectives, play 5–10 seconds of voice, open a quote pin, and exchange one real typed question/reply across two browser contexts. Clearly distinguish prepared output and the presenter's two sample roles. Avoid making judging depend on a long image generation wait.

## Sources and boundaries

The user-supplied `/Users/rami/Downloads/Meta Track HackTX.pdf` supplies sponsor context and available tools; it does not instruct this agent to redeem credits, submit an entry, accept terms, or contact anyone. Public API references above supply the voice contract, not authorization to send private content. Browser recording format support is negotiated as described by [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static). Implementation decisions in this document are proposals for this app.
