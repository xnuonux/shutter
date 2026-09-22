# Current checkpoint: a director has edited and revised a real scene

**September 22 publication handoff:** start with [Codex's handoff to the next agent](../HANDOFF.md). Implementation remains at the September 14 milestone below; this handoff adds documentation only. Fresh full-suite verification: 534 tests, 532 passed, zero failed, two file-symlink skips due to unavailable Windows privilege. The original journal still has 78 records/19 requests and the same digest. No listeners on ports 4677/4688 were present at handoff, so historical PIDs below are stale. Media, app data and raw evidence remain local and are not included in GitHub.

September 14, 2026. Scene-review engine **2f69cf9** and director exercise/guidance **6d1e858** are verified and integrated locally. Start with [the scene review result](scene-review-2026-09-14.md) and [Director calling guide](director-action-guide.md). Canonical repo: C:/dev/shutter, branch codex/shared-scene-timeline. Retained integration worktree: C:/dev/.worktrees/shutter-integration-20260912, branch codex/shutter-integration-20260912.

## Latest director exercise

The [orb handoff exercise](director-exercise-2026-09-14.md) is complete. Codex inspected existing H3 footage through real MCP source-image responses, saved observed moments and direction, applied a bound cutaway, reviewed the composed result, then moved coverage nine frames later to correct the observed gaze at its return. The resulting working cut is **13.5 seconds, 324 frames at 24 fps, 832 × 480**, with aligned original take audio. No generation or paid calls occurred.

Review production **prod_61bf252d-9459-4354-b723-fc11a714fb36**, title **A burden shared · director working cut**, saved revision **6**, is on localhost4688. Main lengths are 96, 104 and 124 frames. Wide coverage [197,224) covers the render join at 200 and returns at source frame 24 of placement, with no timeline extension or restart. Five actual apply receipts retain revisions 2-6. Four source notes and revised direction retain observations and their limits. Earlier examples remain preserved.

The final review MP4 is preserved as through-the-handoff.mp4 in task outputs/shutter/director-exercise-2026-09-14/. Actual state/media assertions and five browser checks pass. A guidance-only catalog change now explicitly directs agents to review and revise after apply; thirteen existing HTTP/MCP action tests passed. No media/edit engine change required a repeated full suite. Canonical original 78 records/19 requests remain unchanged.

This was an inline model choice using actual sampled images, not a second external client certification or complete native-video perception. The client cannot hear audio; sound decoding/alignment is verified, listening quality is not. The unused wide is compatible held-state material from another take, not a synchronized camera. Artist judgment of motion, pacing and sound remains open.

## Current capability

The new shutter_review_scene operation reviews a saved scene interval with its actual visible camera coverage, burned titles/captions and authored sound. Inputs use the production's original output frame clock: startFrame inclusive, endFrame exclusive, at least 2 frames and no more than 30 seconds. It returns seekable MP4 playback, 2-12 ordered JPEG samples (default 8), exact global positions, scene intent and a plan/revision binding. Audio-capable MCP clients can explicitly request an MP3 block; playback includes the mix whenever the scene has authored audio. An exact 48 kHz stereo WAV is also available.

Only the selected interval is rendered. Source sampling phase survives slicing; titles keep their original layout and cue boundaries; sound retains original source offsets, fade positions, gains, mute/solo and master padding. Global start and end samples are rounded independently. Known HDR preparation checks remain in place. Preview size is bounded to a 1280-pixel long edge; JPEGs use at most 640 pixels. The cache is separate from the asset library and creates no cut, source note, timeline edit or paid job. Changed saved context, cancellation or corrupt source/cache bytes cannot return a newly published stale result.

The artist gets the same operation under **Review scene**, below Program. Choose in/out frames and use **Review saved range**. Playback has sound, sample clicks seek, and an exact WAV link is available. Changing the range, production, saved revision or local draft withdraws old playback. Pending text/direction edits must be applied and the cut saved. Program and review playback pause each other.

There are now **31 deterministic editing actions and 13 Studio/workflow MCP tools**, in addition to the legacy production tools. Discovery, context, source motion inspection, marked moments, direction, shot proposals, preview/apply/receipts, cutaway evidence and composed scene review share the existing app services. An action batch of 1-32 commands commits as one reversible revision with a durable request receipt. Bound proposals retain exact source notes and direction; commit-time checks reject changed context. Receipt replay does not repeat an edit.

Original Direct/Canvas/Moment, Material/Program/Timeline, Generate, Takes, Moments, Sound, Finish, Deliver and recovery remain available. Preserve original Lunari, Moment and Blender work.

## Prior engine verification and current runtime

- Full suite: **534 tests, 532 passed, zero failed, two existing Windows symlink skips**, about 32 seconds.
- Four new actual FFmpeg/HTTP/MCP tests compare interval picture with full export, verify exact title-frame presence and compare the WAV sample-for-sample. They cover visible coverage/source phase, stills, fractional rates, separately rounded audio boundaries, large-picture downscaling, silent scenes, master-only audio, range limits, byte-range seeking, cache/source corruption, context changes and cancellation.
- A new MCP transport test rejects incorrect chronology, request identity, frame/audio routes, sample bounds, malformed or oversized audio and redirects, including metadata-only requests. The shared prior JPEG transport tests still pass.
- The new Sound Stage regression compares interval and full mixes across fades, source offsets, master padding, solo and gain; invalid/missing bounds and already-cancelled calls are rejected. Default full-render behavior remains covered by the existing sound suite.
- **15 actual scene-review browser checks** pass, including decoded audio, seeking, stale range/draft/project withdrawal, late responses, label contrast and mobile width. Desktop/mobile screenshots were inspected. **Three read-only canonical browser checks** pass.
- Independent current-source review found no concrete issue in interval picture/audio, provider-write boundaries or UI freshness. It performed syntax/diff checks; actual media and browser evidence above came from the parent run.
- Canonical originals remain **78 records and 19 request entries**, unchanged raw ordered {rows,requests} SHA-256: 7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663.

Canonical app: http://127.0.0.1:4677, PID26412 at verification. Its catalog discovers scene review and malformed review input is rejected before work. Review app: http://127.0.0.1:4688, PID43200. Recheck ownership before restarting either process.

The successful disposable review production is **prod_16d54af0-8619-4b89-8542-c704aede5bcd**, titled "The rain · composed scene review". It preserves a four-second saved main timeline with an alternate view from frames 36-60, a title at 40-60 and an existing timing master. The tested review spans [24,84), 2.5 seconds. Earlier review fixtures remain preserved. The browser script ends with the original saved draft restored and a ready cached review; a fresh browser tab must open Review scene and request its range.

Runtime helpers remain work/env.ps1, work/serve.mjs, work/test-python and work/actions-preservation.mjs in the retained worktree. Intentionally untracked verification/ remains preserved. No remote publication, deployment, provider or client configuration change occurred.

## Spending and unfinished work

**$0 spent, no paid provider calls.** Old balances are stale. The September 12 study's $2.26172 is spending, not a current balance. Reverify actual fal balance and persisted receipts before paid work; do not repeat completed H3/Max studies. The future $10 Eternities commercial remains separately unfunded.

A review URL does not mean an AI watched its video or heard its audio. JPEG samples omit intervening frames; optional audio requires a capable client. Playback uses unmanaged SDR and lossy codecs; the WAV retains the exact sample interval. Sidecar-only captions follow delivery policy and are not burned. These are mechanical review capabilities, not semantic character/continuity approval or episode certification. No external LLM director session is certified. Pixel orchestration, synchronized camera generation and composition-wide color management remain incomplete.

Next bounded milestone: complete the missing Studio setup operations in the director bridge. This exercise needed existing app HTTP APIs to create its production and import the three source files before MCP could take over. Define and implement discoverable creation/import contracts, preserving current local file and spending boundaries. Keep provider setup deferred. The composed review and revision loop has now been exercised on real footage; creative quality and unsupported modalities remain explicitly qualified.

## Prior decisions and evidence

The [approved vision](../VISION.md), [shared scene timing rule](scene-time-and-coverage.md), [source inspection result](source-inspection-2026-09-13.md), [proposal binding](proposal-binding-2026-09-13.md), [director workflow](director-workflow-2026-09-13.md), [cutaway evidence](director-evidence-2026-09-13.md) and [takeover integration](takeover-integration-2026-09-12.md) retain earlier decisions. Main-view time continues beneath alternate coverage; returning to it resumes elapsed scene time and never restarts a paid render.

Latest durable task evidence: outputs/shutter/director-exercise-2026-09-14/; prior implementation evidence is outputs/shutter/scene-review-2026-09-14/ under task 01a087ae-15fc-7e43-8eb2-126e7883d103. Prior research and raw receipts remain in their dated folders; keep them cold unless a specific question requires them.
