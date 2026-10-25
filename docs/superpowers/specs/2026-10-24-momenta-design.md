# momenta: Hackathon Design

Status: MVP implemented after user approval on 2026-10-24. Source is now in /Users/rami/github/momenta. Technical and visual defaults were implementation recommendations; see ../../implementation-progress.md for decisions and verification.

## Intent

"Let me show you how I remember it."

Help a parent, child, or friend communicate a memory as they experienced it. A storyteller describes an event, reviews the details AI extracts, and shapes an illustration until it reflects their perspective. A recipient sees the approved memory and asks a question that the storyteller can personally answer.

The social outcome is a conversation between people about a meaningful experience. Image generation gives them a concrete shared subject. Success is demonstrating the entire exchange, rather than only producing an attractive picture.

## Confirmed scope and constraints

- There are approximately 16 working hours before judging.
- Meta is the primary track. Jester is optional if the finished experience naturally fits; Solana integration is outside this build.
- The user must be able to demonstrate the product alone.
- The first version has one storyteller sharing a memory with one recipient.
- The storyteller controls what the illustration expresses, including explicitly described feelings and perspective.
- Comparing two people's accounts of the same event is deferred.

## Approaches considered

1. **A storyteller shapes and shares one memory.** A complete capture, refinement, and human-response flow fits the time limit. This is the approach the user accepted.
2. **Two people compare versions of the same memory.** Potentially powerful, but requires two creation flows and careful handling of disagreements. Deferred.
3. **An immersive or animated reconstruction.** Visually ambitious but makes camera, scene coherence, and asset generation dominate the build. Deferred.

Implementation recommendation: one Next.js application with server routes and Supabase for persistent data and private image storage. A local-only app would simplify persistence but would not demonstrate genuine link sharing. A separate frontend, API server, and job worker would add deployment and coordination work; use that only if the initial latency experiment makes the simpler hosting approach untenable.

## The minimum complete experience

### 1. Tell the memory

The storyteller enters a title, their display name, who the memory is for, and a short account. Optional prompts ask what they noticed and how the moment felt. Typed text is required; a 30-60 second voice recording with editable transcription is a stretch goal.

Use a single consistent illustrated storybook style. No style selector, reference-photo uploader, timeline, or account onboarding is needed for the demo.

### 2. Review the scene

Muse Spark extracts a draft `ScenePlan`: setting, people, visible details, the storyteller's perspective, and explicitly supplied feelings. Each substantive detail includes a quote from the storyteller's input as evidence. Missing information stays unspecified. Up to two optional follow-up questions help the storyteller add details.

The storyteller can edit this plan and explicitly approve it before generation. Optional questions never block the flow. The app does not infer a hidden emotional state, invent biography, or present generated detail as historical evidence. Captions and names are rendered as normal app text, not baked into the generated artwork.

### 3. Generate and refine

Muse Image creates one illustration from the approved scene. The storyteller can request a correction such as, "Make the parking lot feel enormous, and put Dad farther behind me." The app shows the old and new versions and allows the storyteller to keep either one. Each successful render is saved as a new immutable version; a failed request preserves the prior image and all written input.

Store the approved scene plan with each version. On an edit, use the selected previous image as a reference and include the full approved scene with the requested change. Image consistency is a goal to check visually, not a guarantee. Omit exact face matching, photorealistic reconstruction, multi-scene comics, masks, and animation.

### 4. Share deliberately

The storyteller selects a successful version and publishes it with an approved caption. A shared URL shows this published snapshot, with the label "An illustrated memory, shaped by [name]." Draft text, rejected versions, and internal prompts are excluded. Later edits remain private until explicitly published; publishing updates what the existing share link displays.

Author and share capabilities are separate: a recipient can read the published version and leave a question, but cannot change the memory or call a generation endpoint. Shared access is unlisted bearer-link access, not verified recipient identity. Explain this plainly at publication: "Anyone with this link can view this memory and leave a question."

### 5. Open a human conversation

The recipient types a display name and one question or reaction. Optional question starters are a small fixed set, such as "What happened next?" and "What detail matters most to you?" The storyteller sees the message after refresh and can post a reply. Replies are written by the human storyteller and labeled accordingly. No model impersonates an absent relative or answers unknown facts about the memory.

Questions and replies are associated with the version the recipient viewed. If a newer version is published, retain the earlier thread with a revision label. Updating the illustration from a reply is a deliberate author edit, not automatic processing. Live presence, notifications, and WebSockets are outside the MVP.

## Proposed technical defaults

- Next.js App Router, TypeScript, Tailwind CSS, and the Node.js runtime. Select current stable package versions at execution and pin a lockfile.
- Supabase Postgres and a private Storage bucket. Database and Storage access are server-only; anonymous browser clients receive no direct write permissions.
- Muse Spark through `https://api.meta.ai/v1`, using structured output validated again on the server. Start with `muse-spark-1.3` if the supplied key has access.
- Muse Image `muse-image-1.0`: one-off generation for the first version and image editing with the previous stored image for revisions. Keep image bytes in Storage, not in database JSON or large browser request bodies.
- Server-only `MODEL_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. No secret uses a `NEXT_PUBLIC_` environment name.
- No login for the hackathon prototype. Issue a 32-byte random author capability in an HttpOnly, SameSite=Lax cookie; use Secure in production. Store only its hash. Keep one memory-specific cookie per created memory, and explain that editing is available in that browser.
- Publish a distinct 32-byte random share token; store its hash and look up the memory by that hash. Shared pages never receive the author token or internal model response data.
- Private image paths are persisted. Generate temporary image URLs on authorized page loads rather than persisting expiring provider URLs. The share page is not a public image gallery.
- Mutations enforce same-origin checks, validation, and author/share permissions on the server. Set shared responses to `no-store` and pages to `noindex` with `Referrer-Policy: no-referrer`; avoid third-party analytics on shared pages.
- Configure `MAX_IMAGE_REQUESTS=24` as a prototype-wide request ceiling, atomically reserved in Postgres before a provider call. It is a request cap, not a dollar guarantee. Verify actual pricing and available credit in the first hour before increasing it. Disable SDK automatic retries for images; retry only after an explicit user action.
- Allow at most one render in progress per memory. A request ID and database reservation prevent double-clicks from initiating duplicate renders. Failures, abandoned requests, and timeouts leave existing versions intact. An expired reservation may be released after the provider timeout plus a margin; a late result cannot overwrite a later attempt.
- First hosting candidate: Vercel with Node routes and Fluid Compute, `maxDuration=300`, a provider deadline of 240 seconds, and allowance for upload/persistence. Verify the actual deployment limit and end-to-end latency first. If renders do not fit, switch the same app to a long-running Node host in the first hour; do not add a queue late in the project.

## Data model

- `memories`: id, author token hash, title, author/recipient names, draft story, draft scene plan, published version id, published caption, share token hash, active render request id/expiry, created timestamp.
- `memory_versions`: id, memory id, parent version id, image storage path, approved scene plan, revision instruction, storyteller note, created timestamp. No update-in-place of image versions.
- `messages`: id, memory id, version id, role (`recipient` or `storyteller`), display name, text, optional parent message id, created timestamp. Server derives the role from authorization.
- `render_requests`: id, memory id, status, created timestamp. Count each reserved provider attempt toward the global request ceiling, including failures. Reservation and global cap checks happen in one database transaction protected by a database lock.

Proposed limits: story 6,000 characters; names 80; title 120; correction 1,000; caption and message 2,000. Reject blank required text after trimming. Optional voice files, if implemented, are at most 10 MB and 60 seconds.

## Interface direction

Warm off-white, restrained accent color, generous readable text, and a large illustration. Prioritize large controls and clear language for a parent or older family member. Three views: an author workspace, an image review state within that workspace, and a recipient share page. Include a visible return to the author workspace for the presenter; recipient pages do not expose editing controls.

Keep the memory's narrative and human exchange prominent. Technical model names belong in a small About panel and the submission explanation rather than the main storytelling controls. Generation feedback describes actual stages without fabricated percentages or estimated completion times.

## Sixteen-hour allocation and stop rules

| Elapsed hours | Deliverable |
| --- | --- |
| 0-1 | Check model access, pricing/credit, initial image + edit latency, and deployed runtime. Choose hosting. |
| 1-3 | Create/save/reopen a typed memory; persist author access and private storage. |
| 3-5 | Scene extraction, source quotes, optional questions, editing, and explicit approval. |
| 5-8 | Initial image, one refinement, immutable versions, visible recovery from failure. |
| 8-10 | Publish, independent recipient view, recipient question, storyteller reply. |
| 10-12 | Visual polish, usability, prepared demo memory; voice only if the entire core already works. |
| 12-14 | Focused checks, real-device/cross-browser rehearsal, deployed fixes, freeze features. |
| 14-16 | Record the demo, write the submission, and retain a final buffer. |

At hour 8, cut visual extras and voice if the image loop is incomplete. At hour 10, preserve the real human question/reply exchange and cut optional question generation, extra examples, or animations first. At hour 12, freeze scope. If live image latency is lengthy, demonstrate a prepared real output and one actual new edit, with recorded footage available for the submission. Label prepared examples; do not simulate live API success.

## Demonstration and success criteria

Use one fictional sample memory, clearly labeled, unless the presenter chooses to supply a real personal memory. Proposed example: learning to ride a bike and realizing a parent has let go. The important change is how large the parking lot felt and how far away the parent appeared.

The presenter controls the author browser and an incognito recipient window. Create/reopen the memory, show reviewed scene details, show the initial illustration, request one meaningful correction, and publish. In the recipient window ask, "Were you scared when you realized he'd let go?" Return to the author view and write the response; refresh the recipient view to show it. The illustration expresses supplied details, and the answer comes from a person.

A successful MVP supports this flow across refreshes and a shared URL on another device. A failed edit never destroys the last good version. A recipient cannot access drafts, mutate artwork, or generate a model response. The API key and service role key never reach browser code.

For a three-minute video: 0:00-0:20 problem; 0:20-0:50 capture and review; 0:50-1:30 generation/refinement with honest cuts if needed; 1:30-2:15 sharing and human response; 2:15-2:40 AI integration; 2:40-3:00 tools used and closing value. These times are our proposed edit, not a guarantee that live generation takes that long.

## Remaining builder choices and open checks

Builder may choose component boundaries, exact typography/colors, SQL indexes, and test-library configuration. Preserve the public behavior and time boxes. API access, actual latency, pricing, deployment accounts, and storage provisioning are unverified until execution. No key or account access is needed to approve this plan, and credentials should be supplied through local environment configuration rather than chat.

## Sources

- Track brief: `/Users/rami/Downloads/Meta Track HackTX.pdf`, read as reference material; its account-redemption instructions have not been executed.
- [Muse Image generation and editing](https://dev.meta.ai/docs/image-generation)
- [Muse Spark structured output](https://dev.meta.ai/docs/structured-output)
- [Muse Voice Transcribe](https://dev.meta.ai/docs/speech-to-text), for the optional voice extension; it does not synthesize speech.
- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration), to be checked against the actual deployed account.
