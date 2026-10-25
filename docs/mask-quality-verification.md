# Object outline quality fixes — 2026-10-25

## Reproduced failures

- On the sample bicycle image, Muse Spark discovery with max_tokens=200 ended with finish_reason=length, content=null, and 198 reasoning tokens. The app silently converted missing content to an empty successful map. The same prompt with max_tokens=1200 completed and identified bicycle, person, bell, handlebar, and shoe.
- One failed SAM concept request rejected its worker and discarded every successful mask in the batch.
- A valid 2×2 foreground mask disappeared under the fixed 1.5-pixel contour simplification tolerance.
- Compound outlines filled holes using SVG's default nonzero rule.
- Finer contours could exceed the persisted outline budget; a synthetic 1024² shape with one-pixel alternating edges reproduced this. Adaptive simplification now fits the existing budget.

## Changes

- Discovery gets 2048 output tokens; truncated/empty provider output is a failure rather than a successful empty cache. Prompts prioritize small visible objects and parts separately from people and broad scenery.
- Per-concept failures do not stop workers or discard other successful masks.
- SAM receives images up to 1024 pixels per side, preserving more small-object detail than the previous 768-pixel limit.
- Contours retain fine detail first and retry with coarser tolerances only when necessary to fit the existing path limits. An unrepresentable mask does not discard other records.
- All author/recipient outline overlays use evenodd fill so holes are not selected as foreground.
- Both detail editors offer Refresh outlines. Completed caches can be explicitly rescanned, while pending claims retain their lock. Saved stories and published snapshots are independent of the scan cache. Failed rescans preserve prior masks.
- Existing database functions and privileges suffice; no migration or secret changes required. Existing outline request limits still apply.

## Live checks

- Revised discovery returned bicycle bell, brake lever, black grip, red handlebar, and man in blue shirt on the same image. SAM returned separate usable masks for brake lever, grip, handlebar, and person; bicycle bell returned no match. This remains a model limitation, not perfect exhaustive coverage.
- Helmet segmentation on the supplied screenshot outlined shell/straps and excluded the face. Input already contains the old yellow outline; the newly rendered green overlay is the new mask.
- Visual evidence (local ignored output): output/mask-quality/helmet-after.png and bicycle-parts-after.png.
- Reference: https://dev.meta.ai/docs/sam/segmenting — one concrete concept per call, separate from box/point prompts.

## Verification

- 99 unit/integration tests passed in 22 files.
- 17 browser journeys passed, including an explicit rescan preserving the active saved detail story.
- TypeScript, ESLint, production webpack build, and git diff whitespace checks passed.
- Independent review identified contour-budget and failed-refresh preservation cases; both were reproduced with failing tests and fixed.

Changes are on feat/personalized-memories. Production is unchanged until deployment.
