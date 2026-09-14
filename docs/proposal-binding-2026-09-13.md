# Chosen proposal context survives the whole edit

September 13, 2026. Code `a524e2d` is integrated locally in `C:/dev/shutter` on `codex/shared-scene-timeline`. The retained integration worktree is `C:/dev/.worktrees/shutter-integration-20260912`. No remote publication, provider configuration or paid generation occurred.

## Result

A director can choose a saved shot candidate and carry `proposal: {proposalId, momentId}` with its exact command through preview, source-frame evidence and apply. The preview and receipt retain `proposalContext`: the directing brief, its revision/authorship, and the marked source note's range, identity, revision, words, tags and source hash. The preview hash includes this binding. Stripping or changing it cannot reuse the same preview.

The server checks current note and direction contents as well as their revisions. A deleted and recreated ID with a matching revision number cannot silently change the chosen context. Identical proposal refreshes retain their preview identity despite a new creation timestamp. Evidence checks context before and after asynchronous decoding and before returning a cached result.

Apply resolves and compiles the bound choice again inside the same SQLite write transaction as the timeline and durable receipt. A context change immediately before commit prevents both writes. Historical receipt replay runs first: it returns the originally applied context after later edits to notes, without repeating the timeline operation. Existing artist acceptance uses the same resolver and transactional check, while retaining explicit review and source-alignment requirements.

This adds no action or MCP tool. The 31 editing actions and 11 Studio/workflow tools remain. The bound path accepts exactly one unchanged candidate command; ordinary batches of 1-32 commands continue without a proposal binding. Undo/redo remain unbound history operations. General edits do not create artist-reviewed Take Stack acceptance.

## Verification

- Full suite: **525 tests, 523 passed, zero failed, two existing Windows symlink skips**. After the catalog wording update, all 13 action HTTP/MCP regressions passed again.
- Four additional tests cover stale creative context, stripped/changed/foreign bindings, an in-transaction race, and a source note deleted during real evidence decoding. The existing complete MCP workflow now carries the binding through mark/search/direct/propose/preview/evidence/apply, historical replay and undo.
- The stale-context test includes normal revisions and deleted/recreated notes and direction. Timeline/history and receipts remain unchanged on rejected commits. A repeated equivalent proposal preserves its preview hash.
- Real FFmpeg evidence is first cached, corrupted to force re-extraction, then interrupted by a note deletion. The new partial cache is removed, the saved evidence is not overwritten, and subsequent requests reject the obsolete context.
- Fourteen evidence browser checks pass, including actual request bodies retaining the same chosen binding; fourteen existing artist Director checks pass, including acceptance and undo. Desktop comparison pictures were visually inspected. Three read-only canonical browser checks pass.
- Independent read-only review found no concrete correctness or compatibility issue. The reviewer did not rerun the full suite; parent verification supplies the counts above.
- Original canonical data remains **78 records and 19 request entries**, unchanged raw ordered `{rows,requests}` SHA-256 `7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663`.

Task evidence is saved under `outputs/shutter/proposal-binding-2026-09-13/` in task `01a087ae-15fc-7e43-8eb2-126e7883d103`: test results, browser requests/screenshots and before/after preservation receipts. This milestone's disposable review production is `prod_59e41239-fcb0-4395-b10e-e2a41c280c29` on localhost4688; its four-second main timeline is unchanged. Its browser test ends with an unsaved source-offset edit solely to verify stale-preview withdrawal.

## Boundaries and next step

The binding preserves the context of an edit decision. It does not establish that authored notes are true, authenticate authorship, certify motion/identity continuity or provide a live external LLM director evaluation. Bound source metadata checks do not replace the evidence/artist paths' original-file integrity verification. General unbound batches still protect timeline/source plans rather than creative notes.

**$0 spent.** Refresh the actual fal balance and persisted receipts before any paid work; old balance snapshots remain stale. The future $10 Eternities commercial is separately unfunded. Original Lunari, Moment, Blender and creative footage remain preserved.

Next bounded candidate: expose a discoverable, bounded source-range inspection/audition operation for a director to assess motion over time, extending the current boundary-picture evidence. Inspect existing source-player and local media services before adding another mechanism. Pixel's observation and planning loop, automatic scene understanding and episode-level continuity remain larger unfinished work.
