# Photo memories verification — 2026-10-25

The photo-first experience preserves an uploaded original privately, opens an optimized photograph, prepares selectable object masks, and collects authored stories in one contextual text/voice composer. Source notes are explicitly committed before publication. Recorded words append automatically and can resume on the original target after interrupted transcription or a lost save response. Named person/place/object references are sent as real image inputs to Muse.

## Verification

- TypeScript and ESLint passed.
- Vitest: 91 tests across20 files passed.
- Playwright: all14 browser journeys passed. These cover existing story generation/comparison/conversation, photo upload without metadata, small-object selection, manual fallback, context switching, concurrent typing, voice retry/refresh recovery, duplicate-response recovery and shared source/wider scenes.
- Next.js webpack production build passed.
- PostgreSQL-compatible isolated harness applied migrations001–007 and checked claims, owner constraints, SQL privileges, context revisions, narration insertion/recovery and publication snapshots.
- User applied migrations004–007 to Supabase. Live checks verified signed direct upload, exact original byte/hash preservation, display creation, idempotent completion, private context persistence, frozen publication captions and pending-recording recovery. Test silence stayed private and was never sent to ASR.
- Real SAM helmet concept selected the helmet without the child’s face/shirt. Real Muse reference edit received exact labeled photo bytes. A real wider reconstruction completed in17.3seconds, replayed without another generation, and published committed notes on the original companion photograph.
- Desktop1280px and mobile390px layouts were visually inspected; no horizontal overflow at390px.

## Decisions and limits

The outside-frame spike produced plausible surroundings but changed the source’s position and scale. An exact-source overlay had visible seams. The implementation therefore uses the approved, explicitly labeled side-by-side wider reconstruction. Original imagery and source-relative notes remain on the photograph; generated surroundings are a separate interpretation. This sacrifices a seamless zoom-out effect in favor of a reliable, honest reveal.

Source backend work was delegated with fixed interfaces while the orchestrator verified foundation integration and the independent image spike. Shared adapters were integrated and verified together; the risk was interface adjustment, not changes to the primary checkout.

The fresh review’s two important findings—recording retries moving to another target and missing refresh recovery—were fixed with pending context persistence and frozen capture callbacks. Red/green backend and browser regressions cover the fix wave. A real Supabase empty201 response bug and a shared outline/pin hit-layer conflict were also reproduced and fixed.

Deferred minor: the photo workspace uses manual annotation and neutral question fallback when preparation fails; dedicated retry buttons for failed cached object/question preparation remain future polish. Explicit noun refinement is available.

Private live-test access state, recordings and generated images are ignored and excluded from source control and deployments. Public demonstrations should identify the fictional sample and prepared generated scene honestly.
