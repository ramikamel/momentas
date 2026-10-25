# Published-memory handoff

User request: hide the unavailable perspective invitation before publication; successful publication opens a separate page that clearly confirms publication, with a simple invite action and no accompanying event-name field or explanatory copy.

Flow: Share editor → publish succeeds → /memory/:id/published. This page shows a prominent published confirmation, the actual published image and caption, copy/open share actions, Invite another perspective, and the real conversation. Refreshing the page preserves the published view. Existing editing stages remain reachable through explicit edit/navigation actions. Visiting the published route before publication gives an honest not-published state, with no invitation.

Invitation: derive a neutral event label internally (“A shared memory”), so the invitee is not spoiled by the author's perspective. Keep backend publication authorization and existing comparison behavior intact. No migration required.

Visual direction: use existing blue-ink tokens, a clear success mark, photo preview, and a compact sharing panel; no additional setup form or disabled invitation teaser. The published result uses the published version and caption rather than an unpublished selected draft image.

Verification: browser test hidden-before-publish, successful redirect, enabled invite with no event-name input, reload, edit-return, source-photo publication, and complete two-person perspective comparison.

## Verification

- 100 unit/integration tests passed; all 19 browser journeys passed.
- Expanded sharing test verifies no prepublication invitation, honest unpublished-route state, failed publish staying in the editor, successful publication redirect, no caption/event-name form on the result page, reload persistence, real recipient conversation, and return to editing.
- Dedicated original-photo journey verifies desktop/mobile presentation without overflow, one-click invitation creation, persisted invitation on reload, and editing the existing shared caption without exposing invite controls in the editor.
- The existing full two-perspective flow still passes, including contributor publication, comparison attachment, AI insights, and human replies.
- Source-photo/wider reconstruction publication and frozen shared details remain covered.
- Independent review found no material issues. Sidebar draft metadata remains private author context; the result image and caption use the published version.
- No database changes or production deployment.
