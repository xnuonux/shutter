# Current checkpoint: discoverable Director editing actions

September 13, 2026. Shutter now exposes 31 reversible editing actions through a versioned catalog and five Studio MCP tools: discovery, context, preview, apply and receipt lookup. Read [the action result](director-actions-2026-09-13.md) and [calling guide](director-action-guide.md) first. The [cutaway result](director-coverage-2026-09-13.md), [scene-direction result](scene-direction-2026-09-12.md), [workspace result](studio-workspace-2026-09-12.md), [takeover integration](takeover-integration-2026-09-12.md) and [approved vision](../VISION.md) preserve the larger context. Earlier checkpoints and stale budget snapshots remain in [the archive](checkpoint-before-takeover-2026-09-12.md).

## Current capability and evidence

Any connected MCP-compatible director can discover exact schemas, read the current Studio clock/source IDs, preview a 1-32-command batch, and apply the same revision/hash with a stable request key. A batch is one undo step. Changed revisions or previews fail; receipt replay never repeats a committed edit. Timeline and receipt save atomically in the existing journal. This is deterministic editing over existing material, not automatic cinematic or semantic judgment. Imports, new projects, source scouting, direction briefs, color, delivery and paid generation retain their existing app/API workflows; they are not advertised as commands in this first catalog.

Current verification: **506 tests, 504 passed, zero failed, two existing Windows skips**; **29 targeted action/MCP/sound checks** and **14 real Director browser checks**. Real stdio/HTTP workflow, exact coverage return, persisted retry replay, full undo/redo and receipt-failure rollback are verified. Independent review is resolved. No global Codex or Claude configuration was changed.

Director saves per-shot goals, continuity requirements and source-search words. Whole-shot proposals replace a main source while retaining its timing and original Take Stack selection. Cutaway proposals add existing alternate footage to a chosen scene interval, including intervals crossing main-shot boundaries. Main footage keeps advancing and returns at elapsed source time. Source alignment and continuity are explicitly reviewed by the artist. Existing overlapping coverage is protected.

Audition uses the actual Program viewer and displays a temporary coverage range without changing the saved cut. Acceptance checks source integrity and current cut, brief and source-note revisions. Undo restores the prior timeline. Direction and proposals persist in the existing journal and export with Production Memory. A late video load now seeks to the current playhead rather than an obsolete position.

Earlier cutaway verification: 13 real browser/export checks. The export contains 96 decoded frames at 24 fps with a four-second stereo track. It proves the editing path using existing footage, not generated motion consistency or episode readiness. Desktop/mobile views were inspected.

Review: `http://127.0.0.1:4688/media-studio?project=prod_ad7f5bab-936e-4490-8838-cde0744ff8b8`, then open Director and select the proposal. It uses disposable data with the cutaway undone and the current proposal unaccepted. Canonical app: `http://127.0.0.1:4677`.

## Local source and preservation

Action code `db9a436` is integrated locally. The canonical app on localhost4677 (PID 38008 at verification) passed three read-only browser checks and live 31-action discovery. All 78 records and 19 request entries still match the preservation digest below. Use canonical4677 for the final action interface; review4688's process does not include the last malformed-input correction. See the action result for the blocked optional review restart and completed canonical verification.

Canonical checkout: `C:/dev/shutter`, branch `codex/shared-scene-timeline`. Retained integration worktree: `C:/dev/.worktrees/shutter-integration-20260912`, branch `codex/shutter-integration-20260912`. This milestone follows scene-direction code `08c8480` and handoff `ec74c6b`. Exact integration and preservation observations are recorded in the dated cutaway result. Remote draft PRs and deployments remain unchanged.

Cutaway code `1d15baf` is integrated locally. Three canonical browser checks passed. Before/after journal snapshots match exactly: **78 records and 19 request entries**, digest `7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663`.

Studio at `/media-studio` includes Material, Program, Timeline, Director, Generate, Takes, Moments, Sound, Finish, Deliver and recovery. Original Direct/Canvas/Moment and the main/coverage productions remain available. Preserve Lunari, Moment, Blender and all original creative records. Runtime configuration is in the retained worktree's `work/env.ps1` and `work/serve.mjs`; recheck current process ownership before restarting.

## Spending and unfinished work

This milestone spent **$0** and contacted no paid provider. The earlier $4.72154 balance is stale; the September 12 study records $2.26172 spent, not a current balance. Refresh actual fal balance and receipts before another paid call. Never repeat completed H3 or Max studies. The future $10 Eternities commercial remains separately unfunded.

Matching is over artist-authored words. Semantic source understanding, Pixel orchestration, automatically synchronized camera generation, automatic continuity judgment and composition-wide color management remain incomplete. New Angle still means a continuation after the target shot and refuses a motion-reference tail containing coverage. The separate unpublished richer Editorial Handoff package is not integrated.

Next bounded improvement: connect actual source frames and saved scene intent to the action vocabulary, starting with cutaway entry/return comparison. The director should explain choices from real footage before proposing these deterministic operations. Keep provider setup deferred while finishing this review path.

Latest task evidence: `outputs/shutter/director-actions-2026-09-13/` under task `01a087ae-15fc-7e43-8eb2-126e7883d103`. Previous cutaway artifacts remain in their dated folder. Keep raw receipts and old exploration cold. Consult the approved vision and product blueprint before expanding scope.
