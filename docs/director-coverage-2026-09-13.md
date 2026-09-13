# Timed cutaway proposals in Director

September 13, 2026. Director can now propose existing alternate footage for a specified interval of the shared scene clock. A cutaway can cross a main-shot boundary. The main view keeps advancing and returns at elapsed source time. This completes the next capability recorded in the [scene-direction result](scene-direction-2026-09-12.md).

## Artist workflow

Select a main shot and open Director. Choose cutaway mode, set scene in/out frames, and specify how far into each marked source moment the cutaway should begin. The playhead buttons capture the current scene frame. Saved direction includes this interval and source offset.

Each proposal names the actual source range, covered main views, and the view and source time that will return. Candidate duration is checked against the cutaway interval. The interval must overlap the selected shot and fit within the scene; it cannot overwrite existing coverage. Short sources are refused rather than stretched.

Audition temporarily shows the proposed footage in Program and a dashed range in the coverage lane. Looping includes context around the cutaway. This preview does not modify the saved edit. Source alignment is an explicit artist review decision alongside the scene's continuity requirements. Acceptance applies the shared `coverage-add` edit after checking file integrity and current cut, direction and source-note revisions. Main clips, sound and other timeline contents remain intact. Saved undo restores the exact prior edit.

The original whole-shot replacement mode remains available with its Take Stack behavior. Coverage does not replace a main take. Changing the interval or source offset clears the old review and requires a new proposal.

## Verification

- Full Node suite: **486 tests, 484 passed, zero failed, two existing Windows file-symlink privilege skips**. The five added parent-server cases cover cross-shot return, explicit alignment review, immutable main footage and sound, undo, source fit, invalid or occupied intervals, and stale proposals.
- Actual browser cutaway journey: **13 checks passed**. At 24 fps, the cutaway replaces scene frames 36 through 59, crossing the main-shot boundary at frame 48. Its source starts at 1.5 seconds. Scene frame 60 returns to the main source at 2.5 seconds. Real Program video positions were checked before and after acceptance.
- The same journey exported through Deliver and the local renderer: **96 decoded video frames, four seconds, 768 x 512, with a four-second stereo audio track**. It uses existing footage and a silent PCM timing reference. This is editing/export evidence, not a new continuity generation or a finished creative scene.
- Existing Director browser journey: **14 checks passed**, including loading recovery and unsaved direction. Desktop and mobile rendered views inspected. Independent source review found no blocking issue. `git diff --check` passed.

The browser work exposed two real interaction failures. Brief controls are now disabled while loading so a late response cannot overwrite new typing. When a newly selected video finishes loading, Program recomputes the current playhead position instead of seeking to the stale position captured when loading began.

No paid provider was contacted and this milestone spent **$0**. Tests used disposable review data. The canonical journal is checked before and after local integration.

## Scope and next work

The edit clock and source alignment are explicit and enforced. Whether the orb, hands, movement and background actually match is still an artist judgment. Matching searches saved source words; no semantic video model or Pixel orchestration was introduced. Automatically synchronized alternate-camera generation remains unfinished.

Next: show actual source frames at the entry and return boundaries so the artist can judge action alignment before accepting. Keep providers deferred. Reverify actual fal balance and receipts before spending; older balance snapshots are stale and the future commercial funding remains separate.

## Reproduction and evidence

Use the retained integration worktree's `work/env.ps1`. Run `node --test --test-concurrency=2 test/*.test.mjs` for the suite, or `node --test test/direction-http.test.mjs` for Director's 15 HTTP cases. With the disposable review server running on localhost4688, run `work/test-python/Scripts/python.exe -X utf8 test/browser/director-coverage.py`. This creates a new disposable production and local export. The test does not generate new provider footage.

Review: `http://127.0.0.1:4688/media-studio?project=prod_ad7f5bab-936e-4490-8838-cde0744ff8b8`. Open Director and select the proposed cutaway. The test restored the original cut with undo; the latest proposal is unaccepted. Automated review checkboxes do not constitute an artist's creative approval.

Evidence is saved under `outputs/shutter/director-coverage-2026-09-13/` in task `01a087ae-15fc-7e43-8eb2-126e7883d103`, including browser receipts, desktop/mobile captures, `cutaway-proof.mp4`, test logs and canonical preservation receipts. Runtime paths remain in [the integration result](takeover-integration-2026-09-12.md). Recheck process ownership before restarting a server.
