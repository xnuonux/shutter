# Scene direction and reviewed shot proposals

September 12, 2026. The Studio Director tab now connects an artist's scene intent and continuity requirements to reviewable source selections. It works with saved Production Memory moments and the existing picture edit. No model provider or orchestration service was added.

## Artist workflow

Select a timeline shot and open Director. Write what the shot should accomplish, list continuity requirements one per line, and optionally supply words from saved moment names, notes, tags or filenames. Save direction independently, or find shot proposals. If the cut has unsaved edits, the button explicitly says that planning saves the cut first.

Each proposal identifies an actual source interval, the target scene interval, its authored source notes, whether it contains enough material, and any existing coverage over the shot. Matching is lexical over saved words. The narrative goal and continuity requirements frame the artist's review; they are not fed into a semantic video-analysis model. Empty searches remain empty. Short sources are not stretched.

Select a candidate and audition it through the real Program viewer. The existing camera coverage remains in place. After reviewing the take in context and checking every authored continuity requirement, accept it with **Use this shot · keep timing**. Acceptance changes the main shot's source selection through the shared typed `replace` command. Duration, placement, crop, other shots, camera coverage, song, cues, sound and text remain on their existing clock. The original selection is collected in the Take Stack; saved undo restores the previous timeline.

Briefs and proposal snapshots survive reopening and are included in the Production Memory notebook export. This export remains metadata, not a portable media backup. Proposals are bound to the saved cut, direction revision and source-note revision; changes require rebuilding. Identity and file integrity are checked before application. During asynchronous file verification the server rechecks all relevant revisions. A refused final edit can retain an unaccepted collected take; it cannot partly change picture.

## Interface and preservation

Director is a contextual tab in the existing slate/amber workspace. Unfinished notes survive tool navigation. Switching shots or productions honors the existing discard decision. Loading freezes the brief to prevent a late response from overwriting new typing; failed loads have a retry action. Removed/new shots remain explicitly identified rather than falling back to another shot. The recovery lock also protects Director actions.

The latest proposal is linked explicitly from its direction record. Reusing a previous identical plan cannot reopen a different proposal merely because that record was inserted later. New direction/proposal records cannot overwrite a different record kind with the same identifier.

## Verification

- Full Node suite: **481 tests, 479 passed, zero failed, two existing Windows file-symlink privilege skips**. The ten new parent-server tests exercise real SQLite persistence, media inspection, coverage, soundtrack preservation, acceptance, undo, stale revisions, project scope and record identity.
- Actual browser Director journey: **14 passed**, using existing H3 footage in a disposable production. Covers selection, drafting, planning, in-context audition, review decisions, acceptance, exact undo, reopening, stale proposals, failed-load retry, loading protection and mobile width.
- Existing actual workspace browser checks: **16 passed**. Header recovery, unsaved generation targets, tool navigation and desktop/mobile workspace behavior remain intact.
- Rendered desktop and mobile UI inspected. A checkbox sizing conflict found in the rendered panel was fixed.
- Independent source review and a focused lifecycle follow-up found no further blocking issue. Source was also checked with `git diff --check`.

No provider was contacted and this milestone spent **$0**. All testing used disposable project data; canonical journal preservation is checked before and after local integration. No remote branch, draft PR or deployment is changed by this milestone.

Code is committed at `08c8480` and fast-forwarded locally into the canonical checkout. Three canonical browser checks passed, including the original rain scene editor. Before/after snapshots of all records and request entries match exactly: **78 records, 19 requests**, digest `7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663`. This digest hashes `{rows,requests}` from ordered raw SQL rows; its serialization differs from the earlier workspace receipt. No data migration was required.

## Handoff

Implementation: `src/shot-direction.mjs`, `public/direction-room.js` and its stylesheet; wired through the existing media API and Studio. Tests: `test/direction-http.test.mjs` and `test/browser/direction-studio.py`. Runtime instructions remain in the takeover integration result. Browser Python is `work/test-python/Scripts/python.exe`; `work/env.ps1` configures Chromium and media tools.

Review server: localhost4688, retained integration worktree. The latest disposable review production is recorded in `work/direction-review/receipt.json`. Canonical app remains localhost4677 with original data. Recheck process ownership before restarting.

A clean demonstration is at `http://127.0.0.1:4688/media-studio?project=prod_2a540d7d-5c31-49ac-9558-d9e7c78d0a7b`. Open Director and select The orb in the storm. The demonstration preserves unaccepted continuity checks; test automation's checked boxes are not represented as a creative judgment. At integration, canonical server PID is 3872 and review server PID is 33992. Treat these as observations, not permanent process identities.

Task evidence lives in `outputs/shutter/scene-direction-2026-09-12/` under task `01a087ae-15fc-7e43-8eb2-126e7883d103`, including screenshot captures, browser receipts, suite output and canonical preservation receipts.

Next bounded milestone: let Director propose existing alternate coverage for a specified interval on the shared scene clock, with explicit source alignment and the same audition/accept/undo path. Current Director proposals replace one main shot's source; they do not create synchronized alternate-camera footage. Pixel orchestration, semantic source understanding and automatic continuity verification remain unfinished. Artist review is not identity certification. Refresh actual fal balance and receipts before further paid studies; the future commercial funding remains separate.
