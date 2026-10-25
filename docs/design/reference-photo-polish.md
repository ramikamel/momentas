# Reference photos and visual polish

Intent: make adding a visual reference feel like attaching a photograph to a personal story. User explicitly requested upload → simple name, without person/place/object selection, and supplied frontend-design guidance.

Tokens: album white #F7F8F4, photo white #FFFFFF, blue ink #263E52, pen blue #365C7C, faded paper #E9EDE8, divider #DCE3DE. Muted text #68736E. Existing warm photographic artwork remains the visual focus.

Type: Iowan Old Style / Palatino for memory titles; Avenir Next / Segoe UI for controls and body. Use installed font fallbacks without external font requests. Left-aligned controls, generous line height, bounded copy lengths.

Layout:

    Pictures to remember by               [Upload image]
    Name a picture, then mention it in your memory.

    selected: [preview]  Name: [Our kitchen     ]
                         [Add image]  Cancel

    saved:    [thumbnail] Our kitchen     [remove]

Alternative rejected: a large dropzone and multi-field form would give an optional attachment too much visual weight. Chosen: a narrow attachment shelf integrated with the story field. Distinctive element is the actual photograph and its caption; no decorative icons, eyebrows, pill categories, or large empty-state card.

Plan review against brief: the previous cream/clay/serif treatment was too close to the supplied skill's generic defaults. Move shared ink/accent to photographic blue and soften the page base; keep existing imagery and structure. Remove headline single-word accent styling on the main entry/frame headings. Use quieter sentence-case labels on the updated entry surfaces. Avoid a disruptive page restructuring before the hackathon demo.

Interaction: Upload image opens picker. Preview appears beside a single naming input. Add image or Enter commits; Cancel discards selection. Saved images show thumbnail and name only. Pending unnamed photos prevent generation until added or canceled. Four-image limit and private storage remain.

Compatibility: old reference categories remain internal for existing database constraints, but new clients omit them and generation prompts use only ordered names plus actual image bytes. No migration required.

Verification: meaningful upload/name/save/reload/remove browser journey, missing-category upload regression, model prompt neutrality, desktop/mobile visual inspection, existing tests/typecheck/lint/build.

## Verification result

- Named reference uploads work without category input; actual bytes remain private and model prompts contain ordered names without categories.
- 100 unit/integration tests passed.
- All 18 browser journeys passed. The focused reference journey also passed after keyboard-focus polish: Enter adds without submitting the outer memory form, Upload image regains focus, the named image survives reload, Cancel discards a selection, and removal updates the list.
- Screenshots inspected at 1440px desktop and 390px mobile: selected image editor, saved thumbnail list, story form, and homepage. No horizontal overflow on mobile.
- The test's initial screenshot briefly injected caret styling before hydration; setting caret=initial for homepage screenshots eliminated that test-only warning. Final runs had no hydration mismatch.
- Lint, TypeScript, and production build checked before commit.
- No database migration, API key changes, or production deployment included.
