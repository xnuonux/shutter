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

1. Call `shutter_studio_context`. Select the intended production explicitly. With `projectId`, it returns the actual saved timeline revision, main and visible picture intervals, plan warnings, saved direction and history availability. Source metadata is paged with `assetOffset` and `assetLimit`; follow `nextAssetOffset` when needed. This is metadata, not semantic scene analysis.
2. Call `shutter_preview_actions` with `projectId`, `version`, `baseRevision` and `commands`. A batch contains 1-32 ordered commands. Shutter validates the commands and compiles their result without saving, rendering or contacting a provider.
3. Inspect `changes`, `result.timeline`, `result.visible` and warnings. Compare the requested outcome with the actual affected fields. Frames and IDs must come from the observed context. A fit mode changes framing, not identity. A source replacement does not assert that its content matches.
4. Call `shutter_apply_actions` with the identical preview inputs plus its `previewHash` and a stable `requestKey`. A successful batch is one saved revision and one undo step. Failure commits none of the batch.
5. Read `shutter_action_receipt` with `projectId` and `requestKey` after an uncertain response, or retry the identical apply input. The receipt and timeline are saved in the same SQLite transaction. Replaying a completed key returns its original result, even after reopening the store. A different payload under the same key conflicts.

The apply receipt's `revision` describes that operation. `currentRevision` can be later if another edit has happened. A replay does not reapply the old edit or claim that its result remains selected. Receipts retain the actual commands, changed fields and resulting plan hash. Use fresh context to continue editing.

Undo and redo use the same preview/apply flow and each must be the only command in its batch. They restore full saved decisions, including sound and text. They never restart a generation or alter original source files.

## Inspect a cutaway before applying

After preview, call `shutter_inspect_cutaway` with the same `projectId`, `version`, `baseRevision`, `commands`, optional `proposal` and `previewHash`, plus the `coverageId` in the proposed result. It extracts up to six JPEG source pictures and returns them directly to a vision-capable MCP client, with labeled scene/source positions and a structured manifest. Use `includeImages: false` only when metadata is sufficient. This is local frame decoding and a reusable evidence cache; it does not save the edit, create a paid render, or record continuity approval.

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

The `shutter-cutaway-evidence-v1` manifest binds `id`, production, revision, preview hash, coverage interval, exact source seconds, scene frames, local image URLs and image byte hashes. It includes up to 16 relevant saved shot directions, marked `artist-authored` or `director-authored`, with missing/truncated intent reported. `shutter_studio_context` also exposes saved intent. These are stated aims, not evidence that the picture satisfies them.

Shutter rechecks the preview, intent and source integrity before returning new evidence. Changed state rejects obsolete extraction. A repeated unchanged request reuses verified cached pictures; changed intent produces a different evidence identity. Extraction has a 90-second total deadline, at most six images, a maximum 640-pixel long side and a 256 KiB limit per JPEG. It uses existing FFmpeg and original local assets.

A boundary picture cannot establish motion continuity over an entire interval. Audition the scene to assess motion and sound. Evidence excludes titles and audio, and its unmanaged thumbnails are not calibrated color or generation references. The application does not score identity or auto-check the artist's acceptance boxes. A connected director must explain what it actually sees, distinguish uncertainty from evidence, and use the existing preview/apply workflow for an authorized edit.

## Inspect source motion before describing it

Call `shutter_inspect_source` with an existing video `assetId`, integer source `startUs` and `endUs`, and optional `frameCount` (2-12, default 8). Choose an interval between 0.125 and 15 seconds, inside the source duration. Discover the asset and duration through `shutter_studio_context` first. The tool creates a short silent local playback and returns chronological JPEG images directly to the client. `includeImages: false` returns only the manifest. No note, asset-library item, cut or generation job is created.

```json
{"assetId":"asset_<actual source hash>","startUs":1000000,"endUs":3000000,"frameCount":8}
```

The manifest is `shutter-source-inspection-v1`. Its `preview.url` is a local MP4 path with byte-range support for seeking. Resolve it against the configured Shutter URL to open playback in a browser; an MCP client receiving image blocks has inspected sampled images, not automatically watched that video. The clip is 640 × 360 with contained source framing at 24 fps. It omits source audio and any project sound/text/coverage because it inspects one source, not the assembled scene.

`frames` are ordered first-to-last samples of that playback. Each has `previewFrame`, rational `previewTime`, rational `sourceTime`, image URL and byte hash. `sourceTime` is the nominal resampling clock used by Shutter's exporter, not an original decoded-frame timestamp. `preview.sourceStart`/`sourceEnd` identify the conformed interval; its duration is rounded down to full 24 fps frames, potentially omitting a tail shorter than one frame. `sampling.maxGapFrames` reports the largest gap between shown samples. Narrow the interval to inspect fast action. Do not describe an unseen intervening event as observed.

The result is cached by source identity, profile, range and sampling options. Shutter verifies source bytes and cached images/playback before reuse; profile/source changes during processing reject the result. Decoder work has a 90-second cancellation/deadline signal, at most 12 JPEGs of 256 KiB each, and a 16 MiB playback limit. This uses installed FFmpeg, with no provider. Known HDR requires the existing color preparation workflow first. Unmanaged inspection media is not a delivery or generation reference.

Artists can use the same operation in **Moments → Mark a useful source range → Inspect motion**. Playback and sample clicks inspect that interval without writing the note or changing the cut. Editing its bounds withdraws the old result. The existing **Scout this range** remains the separate coarse visual-change search over longer source intervals.

## Find sources and author direction

Five additional MCP tools connect existing Production Memory and Director workflows to the editing vocabulary. The catalog's `relatedTools` points to them; MCP `tools/list` supplies their closed schemas. They operate on an existing local production and existing imported source assets. They never generate media, upload material or record artist continuity acceptance.

| Tool | Inputs and outcome |
| --- | --- |
| `shutter_search_moments` | Production, optional literal query, kind, favorite filter and offset. Returns at most 50 marked source ranges, their revisions and `nextOffset`. Empty query browses. |
| `shutter_save_moment` | Production, stable moment ID, observed note `baseRevision` and source range/name/notes/tags. Verifies the original asset and range; saves a director-authored note. Use `baseRevision: 0` for a new note. |
| `shutter_get_direction` | Production and main clip ID. Returns saved direction, latest proposal, `timelineRevision` and `directionRevision` (zero when absent). |
| `shutter_save_direction` | Production, clip, observed `timelineRevision`, direction `baseRevision`, and brief. Saves the goal, continuity requirements, source query and optional coverage interval after checking both revisions. |
| `shutter_propose_shots` | Production, clip, current timeline `baseRevision` and `directionRevision`. Saves up to 12 candidates with marked source positions, fit/rejection reasons and a concrete editing command. Does not apply the command. |

Revision names refer to different records. A moment save's `baseRevision` belongs to that moment; a direction save's belongs to direction. A proposal's `baseRevision` belongs to the timeline. Read current values rather than guessing or reusing a revision from another record.

Moment `startUs`/`endUs` and coverage `sourceOffsetUs` are integer microseconds. A one-second offset is `1000000`. Coverage `at`/`end` are integer output frames, end exclusive. Ordinary edit `sourceStart` remains an exact seconds string. Shutter validates the source duration and the full compiled edit in addition to JSON shape.

The practical sequence is: discover assets, use `shutter_inspect_source` to inspect the relevant interval, mark useful source ranges, search those notes, read/save direction, and request proposals. Choose a fitting candidate based on actual evidence and the user's intent. Pass its returned `command` unchanged as the only command to `shutter_preview_actions`, with `proposal: {proposalId: proposal.id, momentId: candidate.momentId}`. Preserve that binding in `shutter_inspect_cutaway` and `shutter_apply_actions`. Inspect the returned `proposalContext`, which captures the brief, direction revision/authorship and the marked source's range, content and revision. Explain the proposed choice and execute the authorized edit. Undo uses the existing action workflow without a proposal binding.

Search is lexical over names, tags, filenames and saved descriptions; it does not infer faces, motion or story. Only describe what was actually inspected or explicitly supplied by the user. The bridge labels its saved revisions `director-authored`; the editor's user-save path labels its revisions `artist-authored`. These labels identify the latest authoring path, not an authenticated identity, factual verification or endorsement. Existing artist notes are not rewritten or migrated.

After an uncertain note save, search/read back the same stable ID and compare the saved revision and contents. After an uncertain direction save, call `shutter_get_direction`. Repeating the old revision conflicts rather than saving twice; these writes do not have the editing receipt's replay semantics. Do not invent a new note ID or blindly increment the revision to force a retry. A source ID cannot be rebound across productions or assets.

Saved proposals can become obsolete. A bound preview rejects a changed source note, direction or timeline, including changed content under a deleted and recreated ID with the same revision number. Apply checks that context again inside the same transaction as the timeline and receipt write. Evidence checks it throughout extraction and before cache reuse. Equivalent proposal refreshes do not invalidate the preview merely because their creation timestamp changed.

A bound preview hash cannot be reused after stripping or changing its binding. Exactly one unchanged candidate command is supported per bound edit; independent batches of 1-32 commands remain available without a binding and protect the timeline/source plan only. A historical receipt retains the context that was actually applied and replays after later context changes without editing again. Rebuild an obsolete proposal before making a new choice. Applying an edit does not create an artist-reviewed Take Stack selection; explicit UI acceptance retains its review/alignment requirements and uses the same final context check.

## Timing and consequences

- Scene positions are integer output frames. Intervals include their first frame and exclude their end. Source positions are exact nonnegative seconds supplied as strings, such as `"3/2"`; they are not source-frame indices.
- Main clips are sequential. Insert, remove, duplicate, trim and move may shift later picture. Coverage, song, sound clips, text and cues remain pinned to their authored positions. Review synchronization after these changes. Invalid source lengths and coverage placement are rejected.
- A split preserves the source sampling clock. Coverage substitutes picture over the same scene interval without extending scene runtime. On return, main footage resumes at elapsed source time. Source alignment must still be chosen and reviewed deliberately.
- Sound clips use integer sample frames at 48,000 Hz. Moving picture does not move the mastered song. Gain and fade commands do not imply automatic mixing, ducking or normalization.
- Schemas reject malformed input; the shared compiler also checks real asset kind, duration, stream constraints, overlap and complete timeline validity. A structurally valid command is not a promise that every production can execute it. Preview is the final applicability check.

## Failures and boundaries

`revision_conflict` or `action_preview_conflict` means the observed state or proposed result changed. Read context and rebuild the preview. Do not silently substitute another source or broaden the requested change.

`action_request_conflict` means a request key was already used for different input. Inspect its receipt. Use a new key only for a deliberately different operation. `action_arguments` identifies malformed arguments; request the action's schema and correct them. A missing receipt is not evidence of success.

`direction_revision_conflict` and `memory_revision_conflict` require rereading the direction or source note and rebuilding the proposal. `proposal_command_conflict` means the bound command is not exactly the chosen candidate, or the batch includes other commands. Send the chosen single command or preview a deliberately independent edit without a binding.

The 31-action surface covers reversible editing of existing Studio material. With source motion inspection there are twelve Studio/workflow tools, alongside legacy MCP shot and Blender-stage tools. Asset import, production creation, coarse source scouting, Take Stack review, color processing, local export and paid generation retain their existing app/API workflows. A live third-party director session has not been certified by the protocol tests.

The bridge does not grant generation, spending, uploading, publication or hosted access authority. Do not turn a successful edit into a claim of artist continuity approval. Pixel can use these operations as its execution vocabulary; Pixel's planning and observation loop remains a separate implementation task.

## Verified evidence

The production tests exercise real HTTP and stdio callers, SQLite state, imported media metadata, exact cutaway return, mixed sound/text batches, invalid input, stale preview, retry replay, undo/redo and receipt-write rollback. See [the implementation result](director-actions-2026-09-13.md) for the final counts, local integration and preservation evidence.
