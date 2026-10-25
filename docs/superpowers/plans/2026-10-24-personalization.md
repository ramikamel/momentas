# Natural capture and personalized images

User-requested design: prepare meaningful object outlines before annotating; permit choosing/changing smaller overlapping objects such as helmet vs head, including explicit object-name refinement. Record on the same page without metadata prerequisites; stopping automatically transcribes into the single existing story field, preserving typed text. Add private uploaded photos labeled with names/place/object descriptions and actually pass those references into Muse generation and edits.

Use Spark vision to suggest at most six object concepts, then SAM concept segmentation (not point-only inference) to produce genuine masks. Cache per immutable image version; claim the preparation atomically and never pay again on refresh. GET only reads status. Reserve up to six SAM attempts per batch against the existing durable limits; explicit object search reserves one. Show the image immediately with preparation status, then selectable outlines and accessible object buttons, smallest overlapping masks on top; selected object and note can be changed. Preserve a manual-pin fallback and existing annotations. Label selection is metadata; note text remains authored by the storyteller.

Voice: no navigation to start, no duplicate transcript box, no Transcribe/Use steps on success. Stop uploads and transcribes automatically, appending to current typed text. Failed transcription retains playback and exposes Retry. Draft metadata is optional with transparent editable defaults (A memory / Me / Someone close). No invented autobiographical details. Recorded voice remains private unless deliberately published.

Reference photos: at most four JPEG/PNG/WebP inputs, browser resized before upload and server validated/re-encoded to strip metadata. Label and kind person/place/object. Store privately under existing memory image bucket, owner-only preview/removal, atomic per-memory count/label validation. Named images are passed as ordered actual inputs to Muse images/edits alongside prompt labels and, for edits, the selected generated image. Only use a reference when relevant to the account; references improve resemblance without promising exact likeness. Raw references never enter public views. Capture reference IDs in private saved scene metadata. Existing no-reference generation stays supported.

- [ ] Shared types, additive migration004, local/Supabase persistence and atomic map claims/batch request reservations.
- [ ] Automatic object map service/routes/UI and helmet concept test.
- [ ] Same-page auto-transcribing VoiceRecorder and metadata defaults/integration.
- [ ] Labeled private reference uploader/service/routes and actual provider inputs.
- [ ] Focused regressions, whole-branch review, full tests/browser/production build; real SAM helmet and reference-generation smoke checks; apply schema, push and deploy with existing authorization.

Ruling: user supplied the interactions and requested implementation/feasibility, so use their specification directly without another approval round. Native worktree tool remains tied to stale untitled context; reuse established manual fallback. Subagents own separate components/services; root owns all shared storage/schema and memory-app/provider integration. Paid preparation must be cached and bounded. User applies additive SQL because service-role API cannot change schema.
