# The Director editing contract

Shutter's Studio editing contract is `shutter-actions-v1`. It lets an MCP-compatible director discover the available editing operations, inspect a production, preview a deterministic batch, and commit the exact result with durable retry handling. It requires the local Shutter app and an existing asset-backed Studio production. No model provider is needed for these operations.

The creative choice belongs to the artist and their director. The contract guarantees bounded editing behavior; it does not certify motion, identity, story interpretation or visual quality.

## Connect and discover

Start Shutter, then use [the example MCP configuration](../mcp.example.json) in the chosen client. The stdio entry point is `src/mcp.mjs`; its HTTP target defaults to localhost4677. No global Codex or Claude settings are changed by this implementation.

Call `shutter_action_catalog` with no arguments for compact descriptions and effects. Then request schemas only for the action types needed, for example:

```json
{"types":["split","coverage-add","text-put"]}
```

The returned version, schemas, limits and examples are authoritative for the running app. Example IDs illustrate shape; always use the actual source and production IDs from context. Never infer an action from a UI label, guess a tool name, send extra fields, or invent a source range.

| Editing area | Available actions |
| --- | --- |
| Main picture | `insert`, `split`, `trim-end`, `slip`, `replace`, `move`, `remove`, `duplicate`, `fit` |
| Alternate coverage | `coverage-add`, `coverage-update`, `coverage-remove` |
| Song and cues | `soundtrack`, `music`, `marker-add`, `marker-remove` |
| Sound Stage | `sound-enable`, `sound-output`, `sound-master`, `sound-track-add`, `sound-track-remove`, `sound-track-update`, `sound-clip-add`, `sound-clip-remove`, `sound-clip-update` |
| Text | `text-put`, `text-delete`, `text-delivery`, `text-import` |
| History | `undo`, `redo` |

## Read, preview, apply

1. Call `shutter_studio_context`. Select the intended production explicitly. With `projectId`, it returns the actual saved timeline revision, main and visible picture intervals, plan warnings and history availability. Source metadata is paged with `assetOffset` and `assetLimit`; follow `nextAssetOffset` when needed. This is metadata, not semantic scene analysis.
2. Call `shutter_preview_actions` with `projectId`, `version`, `baseRevision` and `commands`. A batch contains 1-32 ordered commands. Shutter validates the commands and compiles their result without saving, rendering or contacting a provider.
3. Inspect `changes`, `result.timeline`, `result.visible` and warnings. Compare the requested outcome with the actual affected fields. Frames and IDs must come from the observed context. A fit mode changes framing, not identity. A source replacement does not assert that its content matches.
4. Call `shutter_apply_actions` with the identical preview inputs plus its `previewHash` and a stable `requestKey`. A successful batch is one saved revision and one undo step. Failure commits none of the batch.
5. Read `shutter_action_receipt` with `projectId` and `requestKey` after an uncertain response, or retry the identical apply input. The receipt and timeline are saved in the same SQLite transaction. Replaying a completed key returns its original result, even after reopening the store. A different payload under the same key conflicts.

The apply receipt's `revision` describes that operation. `currentRevision` can be later if another edit has happened. A replay does not reapply the old edit or claim that its result remains selected. Receipts retain the actual commands, changed fields and resulting plan hash. Use fresh context to continue editing.

Undo and redo use the same preview/apply flow and each must be the only command in its batch. They restore full saved decisions, including sound and text. They never restart a generation or alter original source files.

## Inspect a cutaway before applying

After preview, call `shutter_inspect_cutaway` with the same `projectId`, `version`, `baseRevision`, `commands` and `previewHash`, plus the `coverageId` in the proposed result. It extracts up to six JPEG source pictures and returns them directly to a vision-capable MCP client, with labeled scene/source positions and a structured manifest. Use `includeImages: false` only when metadata is sufficient. This is local frame decoding and a reusable evidence cache; it does not save the edit, create a paid render, or record continuity approval.

The Director panel offers the same path under **Compare cut boundaries** for a selected timed cutaway proposal. It shows four comparisons: entry across the cut, entry at equal scene time, return at equal scene time, and return across the cut. A picture can appear in more than one comparison without being extracted twice.

For coverage occupying frames 36 through 59, the evidence roles are:

| Role | Scene frame | Purpose |
| --- | --- | --- |
| `entry-before` | 35 | Actual visible picture immediately before coverage |
| `entry-main` | 36 | Main action at coverage entry |
| `entry-alternate` | 36 | Alternate action at the same scene time |
| `return-alternate` | 59 | Last alternate picture |
| `return-main` | 59 | Main action at the same time as that last alternate picture |
| `return-after` | 60 | Actual visible picture after coverage |

At the start/end of the scene, nonexistent before/after pictures are omitted. Neighboring coverage is represented as visible picture where applicable. Sampling retains the exact source clock and framing used by the exporter, including stills and mixed source frame rates. Main time never restarts.

The `shutter-cutaway-evidence-v1` manifest binds `id`, production, revision, preview hash, coverage interval, exact source seconds, scene frames, local image URLs and image byte hashes. It includes up to 16 relevant saved shot directions, explicitly marked `artist-authored`, with missing/truncated intent reported. `shutter_studio_context` also exposes saved intent. Use these notes as the artist's stated aim, not evidence that the picture satisfies it.

Shutter rechecks the preview, intent and source integrity before returning new evidence. Changed state rejects obsolete extraction. A repeated unchanged request reuses verified cached pictures; changed intent produces a different evidence identity. Extraction has a 90-second total deadline, at most six images, a maximum 640-pixel long side and a 256 KiB limit per JPEG. It uses existing FFmpeg and original local assets.

A boundary picture cannot establish motion continuity over an entire interval. Audition the scene to assess motion and sound. Evidence excludes titles and audio, and its unmanaged thumbnails are not calibrated color or generation references. The application does not score identity or auto-check the artist's acceptance boxes. A connected director must explain what it actually sees, distinguish uncertainty from evidence, and use the existing preview/apply workflow for an authorized edit.

## Timing and consequences

- Scene positions are integer output frames. Intervals include their first frame and exclude their end. Source positions are exact nonnegative seconds supplied as strings, such as `"3/2"`; they are not source-frame indices.
- Main clips are sequential. Insert, remove, duplicate, trim and move may shift later picture. Coverage, song, sound clips, text and cues remain pinned to their authored positions. Review synchronization after these changes. Invalid source lengths and coverage placement are rejected.
- A split preserves the source sampling clock. Coverage substitutes picture over the same scene interval without extending scene runtime. On return, main footage resumes at elapsed source time. Source alignment must still be chosen and reviewed deliberately.
- Sound clips use integer sample frames at 48,000 Hz. Moving picture does not move the mastered song. Gain and fade commands do not imply automatic mixing, ducking or normalization.
- Schemas reject malformed input; the shared compiler also checks real asset kind, duration, stream constraints, overlap and complete timeline validity. A structurally valid command is not a promise that every production can execute it. Preview is the final applicability check.

## Failures and boundaries

`revision_conflict` or `action_preview_conflict` means the observed state or proposed result changed. Read context and rebuild the preview. Do not silently substitute another source or broaden the requested change.

`action_request_conflict` means a request key was already used for different input. Inspect its receipt. Use a new key only for a deliberately different operation. `action_arguments` identifies malformed arguments; request the action's schema and correct them. A missing receipt is not evidence of success.

This 31-action surface covers reversible editing of existing Studio material. Asset import, production creation, source scouting, direction briefs, Take Stack review, color processing, local export and paid generation retain their existing app/API workflows; they are not silently advertised as commands in this version. Legacy MCP shot and Blender-stage inspection tools remain separate. A live third-party director session has not been certified by the protocol tests.

The bridge does not grant generation, spending, uploading, publication or hosted access authority. Do not turn a successful edit into a claim of artist continuity approval. Pixel can use these operations as its execution vocabulary; Pixel's planning and observation loop remains a separate implementation task.

## Verified evidence

The production tests exercise real HTTP and stdio callers, SQLite state, imported media metadata, exact cutaway return, mixed sound/text batches, invalid input, stale preview, retry replay, undo/redo and receipt-write rollback. See [the implementation result](director-actions-2026-09-13.md) for the final counts, local integration and preservation evidence.
