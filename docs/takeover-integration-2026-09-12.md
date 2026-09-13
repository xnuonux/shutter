# Shutter takeover integration · September 12, 2026

This milestone adopts the cumulative ChatGPT implementation and verifies a real local editing path. It does not qualify a finished commercial product or a 20-minute episode.

## Source and integration

- Cumulative source: `astra/generative-insert-planner-20260912` at `be745b1a3496647d11211f5a88accfc765feef4f`, containing the nine stacked draft increments.
- Integration code: `868bf91`, on `codex/shutter-integration-20260912` at `C:/dev/.worktrees/shutter-integration-20260912`.
- The default branch's approved VISION and original vision archive were merged locally at `b85bd3e`. The local canonical checkout is `C:/dev/shutter`; remote draft PRs have not been merged or published by this takeover.
- The richer separately downloadable Editorial Handoff package was not adopted. Existing XML/OTIO/media export is the scope verified here.

## Working result

The new Studio's main clips retain their source ranges. Optional camera coverage replaces the visible picture over an absolute output-frame interval. An angle from scene second 14 to 17 can cover a main-shot boundary at 15 without changing a 60-second scene. At second 17 the program returns to the advancing main performance. Coverage removal reveals the original view; edits remain reversible.

The compiler resolves this into `pictureClips` for local rendering, XML/OTIO handoff, finishing-frame checks and generative boundary references. Main clips retain their identities for editing and Take Stacks. The mastered song, sound lanes and cues retain their independent timing. Missing-media recovery includes alternate views. Invalid overlap, insufficient source handles or a shortened main sequence that strands coverage is rejected before the draft changes.

Continue, Alternate, Bridge and Arrive derive the actual visible boundary frame, including a covered boundary. New Angle still creates a continuation after a shot; it is not automatic synchronized coverage generation. Its short motion reference currently requires an uninterrupted main view. A motion tail intersecting existing coverage is refused locally with an explanation, before provider contact. Generating a composed multi-view motion reference is deferred.

The original Edit page recognizes the new timeline format and links the same production into Studio. Old main/coverage productions are preserved in their existing editor; no automatic migration of their journal or paid footage occurred.

## Verification

At the integration code revision, with real FFmpeg/ffprobe and the installed PyAV probe:

- Full Node suite: **471 tests, 469 passed, 0 failed, 2 skipped**, about 20 seconds. The two skips are file-symlink checks requiring a Windows privilege unavailable to this session. Directory-junction escape checks ran.
- Actual parent server and Chromium browser: **12 checks passed**, using copies of the original H3 rain footage and a quiet test WAV in a disposable production. Import, placement, duration-preserving replacement, coverage across a main cut, invalid-removal refusal, save/reopen, playback back into elapsed main source time, 240-frame export, legacy Edit navigation and mobile containment were exercised. No browser exceptions or provider requests occurred; original H3 file hashes were unchanged.
- Generate Room component: **11 checks passed**. This is an isolated UI fixture, not live-provider evidence.
- The full suite includes a new real Store/H3-adapter integration test: actual reference PNG rendering, upload payload, receipt reconciliation, generated-file download/decoding, Take Stack candidate and explicit insert application. Only the remote provider is replaced by a localhost fixture. No global module loader or production fake is used.
- The coverage regression decodes an actual mixed-rate export, checks the alternate picture, proves resumed frame hashes match the original sequence at elapsed source time, verifies the unchanged WAV and restores the saved edit through history. Covered generation starts, ends and bridge boundaries are exercised with real media.
- Independent source review found one material issue, hidden-main generative boundary references. It was repaired and re-reviewed. The reviewer could not execute media tests without the local runtime environment; the primary agent executed the real-media checks above.

The prior 14 baseline failures included incomplete test doubles, an implicitly required isolated loader, an unmocked pricing lookup, unsupported Windows file symlinks and a fixture that poisoned a later request. Repairs stay within the affected fixtures. They do not weaken the production store or apply a global test loader.

## Reproduce locally

Node.js 24 is required. Set `SHUTTER_FFMPEG`, `SHUTTER_FFPROBE` and `SHUTTER_PROBE_PYTHON` to installed runtime paths. On this machine the portable video tools are under `C:/dev/shutter/work/runtime/ffmpeg/ffmpeg-9.0.1-essentials_build/bin`; the PyAV runtime is `D:/LunariRender/runtime/comfy/ComfyUI_windows_portable/python_embeded/python.exe`. The FFmpeg release archive was obtained from the Windows build link on the [official FFmpeg download page](https://ffmpeg.org/download.html), using [Gyan's release build](https://www.gyan.dev/ffmpeg/builds/), and checked against its published SHA-256 before extraction. No global PATH change was made.

```powershell
node --test --test-concurrency=2 test/*.test.mjs
npm start
```

`npm start` opens the canonical studio at `http://127.0.0.1:4677`. The isolated integration review runs at `http://127.0.0.1:4688/media-studio` with data under the integration worktree's `work/browser-studio`. The task-local `work/env.ps1` and `work/serve.mjs` retain the exact launch environment. Browser checks use a task-local Python environment with Playwright and the installed Chromium; they do not add application dependencies.

Browser reproduction: set `SHUTTER_TEST_CHROMIUM`, `SHUTTER_REVIEW_URL`, `SHUTTER_REVIEW_MANIFEST` and optionally `SHUTTER_REVIEW_ASSETS`, then run `python -X utf8 test/browser/studio-integration.py`. The manifest must provide at least two suitable source videos. The test creates a disposable production, imports those copies and exports locally. The separate Generate test is `python -X utf8 test/browser/generate-dom.py`.

Durable task artifacts are at `C:/Users/Dom/Documents/Codex/2026-09-09/codex-threads-019fa76e-328b-7af3-ada3/outputs/shutter/takeover-integration/`: receipts, logs, desktop/timeline/mobile captures and the actual review MP4. Raw test and disposable-server data stay in the preserved integration worktree.

## Budget and next product work

**Takeover spending: $0. No paid generation, live quote or credential retrieval was performed.** The old local $4.72154 figure is stale. The newer H3 validation document records $2.26172 of study spending; neither number is a current fal account balance. Reconcile the actual account and persisted receipts before any further paid operation. The future Eternities commercial's $10 remains separate and unfunded until Dom confirms it is available.

Next milestone: unify the studio's visual hierarchy around Material, Program, Timeline and contextual Generate/Take Stack controls, retaining the verified edit commands. Production Memory remains authored/range-based with lexical search and local change scouting. Pixel direction, semantic identity/environment continuity and a general executing node canvas remain unfinished. Existing provider results and a green editing path do not establish long-form visual continuity or release readiness.
