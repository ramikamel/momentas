# momentas: explore the photograph, remember beyond its frame

Status: proposed design for user review. Planning only; implementation is paused.

## Intent

User chose three connected ideas: discover little stories in a real photograph; tell those stories through a gentle interview; optionally reveal what they remember outside the frame. The product should feel curious, personal and tactile. Existing story-first generation remains available. New collaborative notes from a second person, voice-synchronized highlights, trips/sequences and video are outside this release.

## The experience

1. **Bring a photograph.** The main entry is “Start with a photograph.” Upload on the current page; no title, name or recipient prerequisites. “Start with a story” preserves the current written/voice route. The original photograph becomes useful immediately: reconstruction is never required to finish a memory.
2. **Let the photograph invite exploration.** It fills the main canvas. Meaningful objects become selectable as cached masks arrive. A brief, subtle initial outline hint teaches the interaction; hover highlights on desktop, and visible object buttons support touch/keyboard. Smaller overlapping objects win hit testing. A helmet and its wearer can be selected independently. “Find something else” accepts a noun such as helmet; an explicit Change target action can reassign a note if the model picked the wrong object. A manual spot remains a fallback.
3. **A gentle interview.** Show one question at a time, at most three initially. Questions invite the person's own recollection: who was present, what a selected detail means, or something beyond the photo. Answer, skip or finish freely; no questionnaire completion gate. Spark asks questions and never writes the autobiography or invents identities/emotions.
4. **Speak into one composer.** One persistent text composer is active at a time: the overall story or the selected detail. Record starts here. Stop transcribes automatically into that composer; there is no separate transcript box or Use button. Existing typed words remain. The capture target is frozen while recording/transcribing, preventing words attaching to the wrong object. Editing is always available afterward. Keep draft text per context when moving around the photo. A normal context switch restores that context's own text; explicit Change target carries the current note to another mask.
5. **Collect the small stories.** Saving a note produces a gentle highlight and a small story card. A non-competitive count such as “3 little stories in this photo” gives feedback. A finished photo is an invitation to discover, not a field list. No scores, badges, streaks, forced tours, loud confetti or autoplay audio.
6. **Outside the frame.** Offer “Show what I remember beyond this photo” after the person supplies an off-frame recollection. If missing, ask that question rather than inventing an event. Request generation only on this deliberate action. The original stays visible while generation runs. A successful expanded scene opens with a short zoom-out/reveal and an accessible Original / Beyond the frame toggle. Original content remains a protected layer, and generated surroundings are labeled “AI reconstruction from your recollection.” Original and expanded views are always independently available.
7. **Let someone explore.** The author previews the same experience a recipient will get: tap a meaningful object, discover a note, optionally play an actual recording, and reveal the wider remembered scene if shared. Publication explicitly chooses image(s), notes and optional audio. Existing human question/reply works. Adding another person's perspective on the same photograph is deferred.

## Visual and interaction direction

Keep momentas' warm paper, editorial typography and earthy accent. Give the photograph more space, reduce the visible form chrome, and place small contextual cards beside it on desktop and below it on mobile. Use 150–250ms highlights/card transitions, one subtle successful-save response and an approximately 700ms expansion reveal. Respect reduced motion with immediate state changes. Outlines are useful affordances, not a permanently bright web over every object. Object buttons remain reachable and visible when hover is unavailable. Text, errors and generation state never depend only on animation or color.

## Answer targets and recovery

A broad interview question targets the overall story. An object-specific question targets an existing note draft for that object or creates one with a stable note UUID. Answer selects that context only before capture begins; while recording/transcribing, target-changing controls are disabled. Normal object navigation restores each context's own text. Explicit Change target changes the region binding of the stable note draft and carries its text intentionally.

Private context drafts are stored by memory, source version and context key (story or note:<uuid>), with text, region binding, revision, question progress and narration association. These are separate from committed notes and publication snapshots. For the photo-first path, the story draft is canonical and updates memories.story as a compatibility projection in the same transaction. Voice insertion is atomic and keyed by narration ID and target context; replaying an uploaded/transcribed clip never appends it twice. Interrupted transcription resumes the saved narration instead of recording/reuploading automatically. Unsaved object drafts never appear in public snapshots.

Source note coordinates and masks remain source-relative. In an expanded canvas, map x to sourceRect.x + x * sourceRect.width and y analogously; transform masks through the same rectangle. Never redetect the source's existing notes on an AI output. In wider-reconstruction fallback, interactive notes remain on the original photograph.

## Original, display copy and reference photos

The primary photograph is evidence the person kept; named reference photos are optional visual guides for a person/place/object. They must have separate controls and storage roles. Preserve the original uploaded bytes and hash privately. Derive a resized, metadata-stripped display copy for analysis/serving; label this as the original photograph in the product because its content is unchanged. Original file download remains owner-only. A generated version never replaces either source asset.

Use an owner-issued signed upload to a dedicated private source bucket so normal phone photographs can bypass the hosted request-body ceiling. Initial limits: one source per memory, JPEG/PNG/WebP, 12 MiB file size, 24 megapixels, no animated files; the storage bucket enforces the byte/MIME limit and completion validates actual decoded content. No HEIC conversion in this milestone: offer an actionable JPEG export message. Orphan cleanup and idempotent completion are part of upload, not a later task.

Upload lifecycle is pending-upload → validating → ready or failed. Completion uses a unique owner-scoped upload ID and an expiring atomic claim. Original/display paths are unique to that upload; a successful metadata transaction adopts those paths. If display creation succeeds but metadata commit fails, retry can reuse the same verified assets. A rejected competing upload can clean only its own unadopted paths. Cleanup is allowed only for failed/expired uploads after a grace period and after checking no accepted source references those assets. A browser closing during upload never deletes the accepted photograph. Bucket uploads do not permit overwriting an accepted original.

## Source preservation in the reveal

Muse currently supports reference-image edits, but mask input is unsupported. A prompt alone cannot guarantee pixel preservation or correct alignment. First validate a padded-canvas/reference approach on one labeled fictional photo. Keep an exact source display raster as an independent protected layer and record its rectangle within the expanded canvas. Composite the protected raster into any flattened expanded export. Do not advertise perfect outpainting until the spike demonstrates acceptable edge alignment.

If alignment is poor, v1 shows a clearly labeled wider reconstruction beside the untouched photograph. The desired reveal remains a planned enhancement, not a disguised successful expansion. The original-photo exploration/interview remains a complete deliverable in either case. No paid spike or implementation begins before user approval of the new plan.

## Data and privacy

Preserve generated-version compatibility and legacy share tokens. Add source/generated origin, source-photo assets, cached questions and outside-frame metadata additively after pending migration004. Source previews, object analysis, questions and reference previews require the owner capability. Shared views receive only explicitly published immutable source/expansion assets, notes and opted-in narration; full-resolution originals and raw named references remain private. Image origin and labels must be correct in editor, gallery, sharing and comparison.

Questions and object masks are cached by immutable source version. GETs never run models. Preparation is atomically claimed, records pending/failed/completed state and has explicit retry. Generation reserves a request ID before paid work and replays completed responses; pending/expired handling reuses the existing recovery semantics. A browser refresh must not pay for the same job again. Slow analysis, poor masks or failed expansion never block opening, annotating or sharing the source photo.

## Current implementation boundary

Main is at 9412720 when planning starts. The isolated /private/tmp/momentas-personal checkout contains unfinished voice, named-reference and automatic-object changes plus migration004; they are not integrated, fully verified or deployed. Finish and review that foundation once execution is authorized. Do not discard it, assume it shipped, or rebuild it independently. Preserve unrelated main-checkout changes (next-env.d.ts and .cursor/).

## Success and judging moment

A solo presenter uploads a labeled fictional photo, taps a helmet, records a sentence, sees that sentence appear once in the active composer, saves it, answers/skips one prompt, and reveals a prepared real AI wider scene. A recipient browser discovers the saved details and leaves a human question. Prepared output is identified as prepared; no fabricated relatives, voices or autobiographical answers. A new real expansion is verified before rehearsal, but the live presentation need not wait on model latency.

## Review disposition

A fresh low-reasoning builder review identified answer targeting, note-coordinate transforms, durable context drafts, upload compensation and the milestone cut line. These have been specified without adding a new product decision. Mainline photo exploration/interview/sharing is the first complete milestone; a seamless expansion proceeds only after its visual spike and core acceptance pass. The foundation estimate remains provisional until its paused diff is reviewed.
