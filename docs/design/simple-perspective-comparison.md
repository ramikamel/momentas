# Simple perspective comparison

User request: shorten the contributor's publication-attachment copy; remove redundant waiting/frozen-version paragraphs; show only the two images side by side on the comparison page, without tabs or bottom insights/conversation sections. Check opening styles too.

Chosen flow: published contributor sees “Share this published version. Later edits stay private.” and “Add my perspective.” An attached comparison offers “View both perspectives.” The original inviter can see a short waiting status while the other person has not shared.

Comparison: open directly to a compact heading and two published-image figures, each with a person's name and a clear original/AI source label. No reveal gate, tabs, duplicated source images, image-detail pins, narration player, story text, AI insights, or conversation form on this page. Both figures remain side by side on mobile. The existing normal recipient-view conversation and all stored data remain available elsewhere; no schema or permission changes.

Style: use shared Header, blue ink, common story/body fonts, white image surfaces, subtle shared borders. No legacy comparison selectors may hide one image on mobile.

Validation: browser checks direct opening, absence of removed UI, side-by-side mobile geometry, waiting-state refresh, and real invitation→contribution→publication→attachment flow. Run existing functional tests and inspect new desktop/mobile screenshots; deploy to the stable test address after verification.

Verified: 100 unit/integration tests and all 21 browser journeys passed. ESLint, TypeScript, and the webpack production build passed. Desktop/mobile screenshots confirm both images remain visible side by side without tabs or bottom sections. The normal shared-memory voice and reply flow also passed.
