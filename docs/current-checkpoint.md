# Current checkpoint: timed Director cutaways

September 13, 2026. Director now proposes alternate footage for a specified interval on the shared scene clock, with explicit source alignment, actual Program audition, reviewed acceptance and saved undo. Read [the cutaway result](director-coverage-2026-09-13.md) first. The [scene-direction result](scene-direction-2026-09-12.md), [workspace result](studio-workspace-2026-09-12.md), [takeover integration](takeover-integration-2026-09-12.md) and [approved vision](../VISION.md) preserve the larger context. Earlier checkpoints and stale budget snapshots remain in [the archive](checkpoint-before-takeover-2026-09-12.md).

## Current capability and evidence

Director saves per-shot goals, continuity requirements and source-search words. Whole-shot proposals replace a main source while retaining its timing and original Take Stack selection. Cutaway proposals add existing alternate footage to a chosen scene interval, including intervals crossing main-shot boundaries. Main footage keeps advancing and returns at elapsed source time. Source alignment and continuity are explicitly reviewed by the artist. Existing overlapping coverage is protected.

Audition uses the actual Program viewer and displays a temporary coverage range without changing the saved cut. Acceptance checks source integrity and current cut, brief and source-note revisions. Undo restores the prior timeline. Direction and proposals persist in the existing journal and export with Production Memory. A late video load now seeks to the current playhead rather than an obsolete position.

Verification: **486 Node tests, 484 passed, zero failed, two existing Windows symlink privilege skips**; **13 real cutaway browser/export checks** and **14 existing Director browser checks**. The export contains 96 decoded frames at 24 fps with a four-second stereo track. It proves the editing path using existing footage, not generated motion consistency or episode readiness. Desktop/mobile views were inspected and independent review found no blocker.

Review: `http://127.0.0.1:4688/media-studio?project=prod_ad7f5bab-936e-4490-8838-cde0744ff8b8`, then open Director and select the proposal. It uses disposable data with the cutaway undone and the current proposal unaccepted. Canonical app: `http://127.0.0.1:4677`.

## Local source and preservation

Canonical checkout: `C:/dev/shutter`, branch `codex/shared-scene-timeline`. Retained integration worktree: `C:/dev/.worktrees/shutter-integration-20260912`, branch `codex/shutter-integration-20260912`. This milestone follows scene-direction code `08c8480` and handoff `ec74c6b`. Exact integration and preservation observations are recorded in the dated cutaway result. Remote draft PRs and deployments remain unchanged.

Cutaway code `1d15baf` is integrated locally. Three canonical browser checks passed. Before/after journal snapshots match exactly: **78 records and 19 request entries**, digest `7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663`.

Studio at `/media-studio` includes Material, Program, Timeline, Director, Generate, Takes, Moments, Sound, Finish, Deliver and recovery. Original Direct/Canvas/Moment and the main/coverage productions remain available. Preserve Lunari, Moment, Blender and all original creative records. Runtime configuration is in the retained worktree's `work/env.ps1` and `work/serve.mjs`; recheck current process ownership before restarting.

## Spending and unfinished work

This milestone spent **$0** and contacted no paid provider. The earlier $4.72154 balance is stale; the September 12 study records $2.26172 spent, not a current balance. Refresh actual fal balance and receipts before another paid call. Never repeat completed H3 or Max studies. The future $10 Eternities commercial remains separately unfunded.

Matching is over artist-authored words. Semantic source understanding, Pixel orchestration, automatically synchronized camera generation, automatic continuity judgment and composition-wide color management remain incomplete. New Angle still means a continuation after the target shot and refuses a motion-reference tail containing coverage. The separate unpublished richer Editorial Handoff package is not integrated.

Next bounded improvement: show actual source frames at the cutaway entry and return so the artist can compare action alignment before accepting. Keep provider setup deferred while finishing this review path.

Task evidence: `outputs/shutter/director-coverage-2026-09-13/` under task `01a087ae-15fc-7e43-8eb2-126e7883d103`. Keep raw receipts and old exploration cold. Consult the approved vision and product blueprint before expanding scope.
