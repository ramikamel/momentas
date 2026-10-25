# One visual system across momentas

User request: the perspective invitation still looks like the old site; make the entire website match the updated design.

Root cause: invitation/comparison routes duplicated the header, while their shared connection/voice stylesheet and photo-detail stylesheet retained clay accents, Georgia overrides, and cream surfaces. The prior redesign updated only the main entry/reference surfaces.

Approach: reuse one Header/Brand component across home, library, editor, shared recipient, invitation, and comparison routes. All UI surfaces, headings, controls, and focus rings use the existing blue-ink design tokens. Shared tokens now also cover surface/field colors, success/error roles, and image-mask highlights. Preserve the natural colors of photographs/illustrations and high-contrast gold masks as functional image-selection feedback.

Scope: invitation and comparison, recorded-voice controls, detail editor, library cards, source-photo workspace, share editor, and published page. Match typography, control heights, borders, and neutral surfaces; do not change invitation authorization, comparison privacy, or the memory workflows.

Validation: screenshot invitation and revealed comparison at 1440px/390px; inspect existing main-entry, reference, library and publication views; rerun all browser journeys plus unit tests, typecheck, lint, and build. Deploy the updated test build after verification so the user can check the changes directly.

Verification complete: 100 unit/integration tests and all 19 browser journeys passed. TypeScript, ESLint and production build passed. Invitation and comparison screenshots reviewed at desktop/mobile sizes; no horizontal overflow. All route headers now come from site-header.tsx, and no component CSS retains Georgia overrides or the old clay action colors. No changes to authentication, model requests, database schemas, or comparison behavior.
