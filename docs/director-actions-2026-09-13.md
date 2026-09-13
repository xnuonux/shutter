# Discoverable, deterministic Director editing actions

September 13, 2026. Dom requested the fundamental actions an AI director needs to understand and execute Shutter reliably. This milestone gives existing Studio editing a model-independent action contract, discovers it through MCP, and commits previewed batches with durable retry handling. Read [the action guide](director-action-guide.md) for the supported operations and precise calling sequence.

## Delivered behavior

The `shutter-actions-v1` catalog covers **31 actions**: main-picture edits, alternate coverage, mastered soundtrack selection, music/cue mapping, sound lanes and clips, text and captions, undo and redo. Each has a closed schema, example and explicit timing/sound effects. Catalog summaries are compact; clients request only the schemas needed. Source IDs, exact ranges, current revision, visible coverage and undo/redo availability come from real Studio context with bounded asset pages.

Preview evaluates an ordered batch against the observed revision using the existing edit algebra and final timeline compiler. It returns changed fields, the resulting timeline, visible source runs, warnings and a hash without persisting, generating or rendering. Apply requires the same version, commands, revision and hash with a stable request key. The entire batch becomes one saved revision and one undo step. A failed batch changes nothing.

The timeline and operation receipt share the existing SQLite transaction. Repeating the same request returns the recorded result. Different inputs under a used key conflict. Replayed results report their original revision separately from the current project revision. Receipts retain the actual commands and resulting plan hash and survive reopening the store.

Five MCP tools expose the path: catalog, context, preview, apply and receipt lookup. The prior MCP tools remain available. The existing Studio command endpoint now uses the same dispatcher. Three formerly missing typed operations cover picture insertion, cutaway updates and soundtrack selection. Undo/redo are standalone previewable operations. No new package, provider, agent runtime or database was added.

## Verification and corrections

- Full suite: **506 tests, 504 passed, zero failed, two existing Windows file-symlink privilege skips**.
- Targeted action, MCP and sound regression checks: **29 passed**. Thirteen new HTTP/service cases and seven contract cases are included in the full suite.
- Actual stdio MCP client against the real parent server discovered schemas, read a project, previewed cutaway/text commands, applied once, replayed its result, read the receipt and undid the edit.
- Literal timing assertions verify that scene frames 36-59 use the alternate view and frame 60 returns to main source time 2.5 seconds. Mixed sound/text edits retain the original song and authored sample/frame positions.
- A new Studio instance replays the persisted receipt without incrementing the revision. A SQLite trigger that fails receipt insertion proves the timeline and undo history roll back in the same transaction.
- The existing Director browser journey passed **14 checks** with no uncaught exceptions or paid requests. Independent review found the advertised duration limit too permissive; it was corrected and re-reviewed. Unicode character counting and malformed rational-time rejection were also verified.

The broad suite caught malformed sound input being looked up as an asset before schema validation. Validation now runs first, preserving the existing command endpoint's 400 response and atomic rejection. All verification uses disposable project state and existing or local test media. This milestone spent **$0** and made no paid provider calls.

Code `db9a436` is integrated locally into `C:/dev/shutter`. The canonical app passed three read-only browser checks and live discovery returned `shutter-actions-v1` with 31 actions. Before/after snapshots match exactly: **78 records, 19 request entries**, ordered raw-SQL `{rows,requests}` digest `7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663`. No original creative data was changed. Canonical server localhost4677 was PID 38008 at verification.

## Boundaries and continuation

Determinism applies to validated edit execution against an observed state. It does not make creative interpretation deterministic or establish semantic continuity. Schemas describe structural inputs; the compiler still rejects unavailable source handles, wrong media kinds, invalid coverage and complete-timeline conflicts. An edit operation never records artist continuity approval on its own.

The Studio action catalog covers reversible editing. Import, project creation, semantic/source inspection, direction briefs, Take Stack review, color processing, delivery and generation retain their existing app/API paths. They are not claimed as callable actions in this version. A live Claude or other external LLM director session has not been certified; the actual local MCP protocol and persistence path have been exercised.

Next bounded step: connect source-frame evidence and saved scene intent to this action vocabulary, so a director can inspect the entry/return of a proposed cutaway and explain its choices using actual footage. Preserve the distinction between observations, proposed edits and artist-approved continuity. Refresh actual fal balance and receipts before paid work; the future commercial funding remains separate.

## Source and evidence

Implementation: `public/action-contract.mjs`, `public/edit-actions.mjs`, `src/director-actions.mjs`, existing media routes, store and MCP bridge. The [design and plan](director-actions-plan-2026-09-13.md) records the decision and acceptance conditions. The [previous cutaway result](director-coverage-2026-09-13.md) preserves the preceding capability.

Retained worktree: `C:/dev/.worktrees/shutter-integration-20260912`. Runtime: `work/env.ps1`, `work/serve.mjs`, `work/test-python/Scripts/python.exe`. Suite command: `node --test --test-concurrency=2 test/*.test.mjs`. Browser regression: `test/browser/direction-studio.py` against the disposable review server. Source state is integrated locally after verification; no remote merge or deployment is part of this milestone.

Evidence is retained in task `01a087ae-15fc-7e43-8eb2-126e7883d103` under `outputs/shutter/director-actions-2026-09-13/`: final suite output, targeted and browser results, original red failures, canonical preservation snapshots and this result. Global client configuration remains unchanged; [mcp.example.json](../mcp.example.json) identifies the connection.

Runtime note: the review server on localhost4688 remains PID 18400. A combined verification/review-restart command was rejected by automatic approval review with only `blocked by policy`. The task finished using separate read-only verification of the already updated canonical app. That review process lacks the final malformed-input validation-order correction; use canonical4677 for the final action contract. Recheck ownership and authorization before any later restart.
