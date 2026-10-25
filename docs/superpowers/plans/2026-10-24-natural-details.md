# Natural image details implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace quote selection with image-first author notes and real one-click object outlines.

**Architecture:** Extend backwards-compatible JSON pins with optional author-note provenance and normalized mask contours. Owner-scoped route calls SAM on stored image bytes; validated server pin storage and immutable publications carry contours to shared views.

**Tech Stack:** Next.js, React, TypeScript, Supabase, Meta SAM 3.1 official parser/graphics.

**Spec:** docs/superpowers/specs/2026-10-24-natural-details-design.md

## Global constraints

Five pins/version; 1–500 character author notes; no arbitrary image URLs, no private-key exposure, preserve legacy pins/tokens/snapshots; manual point fallback; additive 003 migration for durable outline budgets.

## Review focus

- Cross-memory versions and anonymous segmentation must fail before provider call.
- Missing/failed/malformed masks preserve typed notes and allow simple-pin save.
- New notes survive save/reload/publication and provide exact evidence for comparison.
- Rapid clicks/cancel/version changes cannot attach stale masks or erase notes.
- Keyboard/touch placement and responsive no-crop alignment remain usable.

### Task 1: Note model and storage
- [x] Add failing domain/storage regressions for free notes, legacy forgery rejection and invalid geometry.
- [x] Extend pin normalization; server derives label/provenance for author notes; preserve old pins.
- [x] Save validated pins with existing private table upsert, validating version ownership and scene in adapter; update local adapter and snapshot mapping.
- [x] Verify focused tests.
- [x] Add and locally verify migration 003 with atomic budgets, ownership, anonymous denial, failure counting and rerunnable setup; user applies schema in Supabase SQL Editor.

### Task 2: SAM object outlines
- [x] Test point coordinate conversion, malformed/outsize masks and owner scoping.
- [x] Add bounded point-prompt SAM service/owner route using saved image; decode/trace with official library; return normalized paths.
- [x] Run real segmentation against a fictional saved image and inspect overlay.

### Task 3: Natural editor and release
- [x] Replace duplicate preview/disclosure with one image editor and visible Add a detail, click-to-place, focused note field, save/cancel/remove and optional outline discard.
- [x] Show selected outlines and notes on recipient/comparison pages with correct provenance.
- [x] Update browser regression for new flow, cancellation, persistence and failure fallback.
- [x] Run full tests/lint/typecheck/build/browser journeys; inspect mobile/desktop; review and deploy/push using existing authorization.

Verification: 53 unit/integration tests, four complete browser journeys, lint and TypeScript passed. Real SAM calls returned real contours; the person contour was visually inspected over the actual image. Supabase note save/read succeeded and sample draft pins were restored. SQL 001+002+003 passed ownership, cap, pending, retry and anonymous access checks locally. The user is applying 003 through Supabase SQL Editor; hosted outline verification follows confirmation. Final reviewer found no remaining important issues after durable reservations and keyboard-marker fixes.
