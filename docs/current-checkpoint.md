# Current checkpoint: review the composed scene

September 14, 2026. Source code **2f69cf9** is verified and integrated locally. Start with [the scene review result](scene-review-2026-09-14.md) and [Director calling guide](director-action-guide.md). Canonical repo: C:/dev/shutter, branch codex/shared-scene-timeline. Retained integration worktree: C:/dev/.worktrees/shutter-integration-20260912, branch codex/shutter-integration-20260912.

## Current capability

The new shutter_review_scene operation reviews a saved scene interval with its actual visible camera coverage, burned titles/captions and authored sound. Inputs use the production's original output frame clock: startFrame inclusive, endFrame exclusive, at least 2 frames and no more than 30 seconds. It returns seekable MP4 playback, 2-12 ordered JPEG samples (default 8), exact global positions, scene intent and a plan/revision binding. Audio-capable MCP clients can explicitly request an MP3 block; playback includes the mix whenever the scene has authored audio. An exact 48 kHz stereo WAV is also available.

Only the selected interval is rendered. Source sampling phase survives slicing; titles keep their original layout and cue boundaries; sound retains original source offsets, fade positions, gains, mute/solo and master padding. Global start and end samples are rounded independently. Known HDR preparation checks remain in place. Preview size is bounded to a 1280-pixel long edge; JPEGs use at most 640 pixels. The cache is separate from the asset library and creates no cut, source note, timeline edit or paid job. Changed saved context, cancellation or corrupt source/cache bytes cannot return a newly published stale result.

The artist gets the same operation under **Review scene**, below Program. Choose in/out frames and use **Review saved range**. Playback has sound, sample clicks seek, and an exact WAV link is available. Changing the range, production, saved revision or local draft withdraws old playback. Pending text/direction edits must be applied and the cut saved. Program and review playback pause each other.

There are now **31 deterministic editing actions and 13 Studio/workflow MCP tools**, in addition to the legacy production tools. Discovery, context, source motion inspection, marked moments, direction, shot proposals, preview/apply/receipts, cutaway evidence and composed scene review share the existing app services. An action batch of 1-32 commands commits as one reversible revision with a durable request receipt. Bound proposals retain exact source notes and direction; commit-time checks reject changed context. Receipt replay does not repeat an edit.

Original Direct/Canvas/Moment, Material/Program/Timeline, Generate, Takes, Moments, Sound, Finish, Deliver and recovery remain available. Preserve original Lunari, Moment and Blender work.

## Verification and runtime

- Full suite: **534 tests, 532 passed, zero failed, two existing Windows symlink skips**, about 32 seconds.
- Four new actual FFmpeg/HTTP/MCP tests compare interval picture with full export, verify exact title-frame presence and compare the WAV sample-for-sample. They cover visible coverage/source phase, stills, fractional rates, separately rounded audio boundaries, large-picture downscaling, silent scenes, master-only audio, range limits, byte-range seeking, cache/source corruption, context changes and cancellation.
- A new MCP transport test rejects incorrect chronology, request identity, frame/audio routes, sample bounds, malformed or oversized audio and redirects, including metadata-only requests. The shared prior JPEG transport tests still pass.
- The new Sound Stage regression compares interval and full mixes across fades, source offsets, master padding, solo and gain; invalid/missing bounds and already-cancelled calls are rejected. Default full-render behavior remains covered by the existing sound suite.
- **15 actual scene-review browser checks** pass, including decoded audio, seeking, stale range/draft/project withdrawal, late responses, label contrast and mobile width. Desktop/mobile screenshots were inspected. **Three read-only canonical browser checks** pass.
- Independent current-source review found no concrete issue in interval picture/audio, provider-write boundaries or UI freshness. It performed syntax/diff checks; actual media and browser evidence above came from the parent run.
- Canonical originals remain **78 records and 19 request entries**, unchanged raw ordered {rows,requests} SHA-256: 7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663.

Canonical app: http://127.0.0.1:4677, PID35656 at verification. Its catalog discovers scene review and malformed review input is rejected before work. Review app: http://127.0.0.1:4688, PID31224. Recheck ownership before restarting either process.

The successful disposable review production is **prod_16d54af0-8619-4b89-8542-c704aede5bcd**, titled "The rain · composed scene review". It preserves a four-second saved main timeline with an alternate view from frames 36-60, a title at 40-60 and an existing timing master. The tested review spans [24,84), 2.5 seconds. Earlier review fixtures remain preserved. The browser script ends with the original saved draft restored and a ready cached review; a fresh browser tab must open Review scene and request its range.

Runtime helpers remain work/env.ps1, work/serve.mjs, work/test-python and work/actions-preservation.mjs in the retained worktree. Intentionally untracked verification/ remains preserved. No remote publication, deployment, provider or client configuration change occurred.

## Spending and unfinished work

**$0 spent, no paid provider calls.** Old balances are stale. The September 12 study's $2.26172 is spending, not a current balance. Reverify actual fal balance and persisted receipts before paid work; do not repeat completed H3/Max studies. The future $10 Eternities commercial remains separately unfunded.

A review URL does not mean an AI watched its video or heard its audio. JPEG samples omit intervening frames; optional audio requires a capable client. Playback uses unmanaged SDR and lossy codecs; the WAV retains the exact sample interval. Sidecar-only captions follow delivery policy and are not burned. These are mechanical review capabilities, not semantic character/continuity approval or episode certification. No external LLM director session is certified. Pixel orchestration, synchronized camera generation and composition-wide color management remain incomplete.

Next bounded milestone: exercise one complete director loop on existing footage, using observed source evidence and saved intent to choose an edit, apply it, review the resulting composed scene, and revise or undo it. Establish the useful creative outcome and limits before expanding autonomous orchestration or provider setup. The tools now support that loop; the scripted transport tests do not establish an AI's creative judgment.

## Prior decisions and evidence

The [approved vision](../VISION.md), [shared scene timing rule](scene-time-and-coverage.md), [source inspection result](source-inspection-2026-09-13.md), [proposal binding](proposal-binding-2026-09-13.md), [director workflow](director-workflow-2026-09-13.md), [cutaway evidence](director-evidence-2026-09-13.md) and [takeover integration](takeover-integration-2026-09-12.md) retain earlier decisions. Main-view time continues beneath alternate coverage; returning to it resumes elapsed scene time and never restarts a paid render.

Latest durable task evidence: outputs/shutter/scene-review-2026-09-14/ under task 01a087ae-15fc-7e43-8eb2-126e7883d103. Prior research and raw receipts remain in their dated folders; keep them cold unless a specific question requires them.
