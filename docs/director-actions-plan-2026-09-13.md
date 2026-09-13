# Director action interface: design and implementation plan

September 13, 2026. Implements Dom's request to make fundamental actions discoverable and deterministic for any AI director. Standing authorization covers the local Shutter build and integration; providers, spending and external deployment are outside this change. Inline implementation with a separate contract owner and independent review.

## Decision

Use the existing pure picture/sound/text edit functions, one versioned catalog, and a preview/apply service shared with the current command endpoint. Expose the service through the local stdio MCP bridge. This adds no model dependency, remote service, separate timeline or agent runtime. The creative plan is an agent decision; the same version, observed revision and commands must produce the same edit.

Verified: the current MCP mostly exposes legacy shots; Studio has typed commands but no complete discovery schema, multi-command preview or durable deduplication. Picture is frame-based with rational source seconds; sound uses 48000 sample frames. Studio.saveTimeline owns compilation, revisions and undo. Its transactions cannot nest.

Alternatives: whole-timeline replacement has fewer interfaces but weak action discoverability and broad unintended changes. Separate agent editing logic offers flexibility but duplicates timing semantics. A catalog over the existing edit algebra preserves browser/export behavior and allows incremental coverage. Reconsider if external editors need unsupported operations; do not invent them inside the bridge.

## Contract and requirements

1. Discovery returns action descriptions, effects and requested closed JSON Schemas/examples. Unknown fields, types and unsupported actions fail. Agents discover summaries first and request only needed schemas.
2. Context reports selected Studio timeline revision, stable source IDs, exact source/scene ranges, visible picture and undo/redo availability. Library pages are bounded. Legacy timelines are identified and never coerced.
3. Preview accepts version, baseRevision and 1-32 commands. It compiles the entire proposed result without saving or launching media/provider work, returning changes, source ranges, warnings and previewHash.
4. Apply requires the same input and previewHash plus requestKey. It rechecks the revision and plan. All commands commit as one saved undo step. Failure changes nothing. Timeline and retry receipt share the existing transaction; receipt replay survives process restart and reports current revision separately from the original result.
5. Undo/redo are standalone commands, previewed and revision-bound like other edits. Source originals are immutable. Picture edits do not ripple sound, coverage, text or cues; invalid final combinations are rejected.
6. Catalog covers every existing picture, sound and text command plus insert, coverage-update and soundtrack selection. Neither catalog entries nor successful edits assert semantic continuity or artist approval.
7. The bridge retains legacy tools and corrects effect annotations. Local editing requires no new provider setup. Existing paid tools retain their explicit generation requirements and are not called by this work.

## Implementation plan

> For agentic workers: keep coupled service/MCP changes inline. The schema/catalog owner works only in public/action-contract.mjs and test/action-contract.test.mjs.

Goal: an MCP client can discover commands, read a real project, preview a combined picture/sound/text edit, apply it once, and undo/redo that exact edit through the production server.

Architecture: public/action-contract.mjs defines schemas. public/edit-actions.mjs dispatches the shared algebra. src/director-actions.mjs handles discovery/context/preview/apply and compact receipts. src/media-api.mjs exposes routes after the existing origin gate. src/store.mjs saves an optional operation receipt atomically with the edit. src/mcp.mjs transports this contract.

Tech stack: existing Node 24 ESM, SQLite, local HTTP, stdio MCP and shared browser modules. No new package.

- [x] Task 1: test real HTTP discovery, side-effect-free preview, exact cross-shot coverage return, invalid commands, stale revisions, atomic batch failure, retry conflict/replay, persistent undo/redo and mixed sound/text edits in test/director-actions-http.test.mjs. Run against the parent server with only remote/legacy provider work disabled; expect missing action routes before implementation.
- [x] Task 2: implement validateCommand and ACTIONS through the separate owner. Add insert, coverage-update and soundtrack to the existing picture algebra. Dispatch applyTimelineCommand(edit, command, profiles) through existing sound/text functions. Wire the old /commands route through this dispatcher; preserve response shape. Include existing and command-referenced coverage sources in profile lookup.
- [x] Task 3: implement actionCatalog(types), directorContext(studio, options), previewActions(studio, projectId, input), applyActions(studio, projectId, input), actionReceipt(studio, projectId, requestKey). Preview compiles before writing. Apply uses saveTimeline's optional atomic receipt and rejects mismatched versions/revisions/hashes/keys. A batch is one undo entry. Undo/redo cannot mix with another command.
- [x] Task 4: MCP tools list catalog, read context, preview, apply and read receipt with exact envelopes. Add production-server stdio integration test: discover the insert schema, preview insert/coverage/text, apply twice with one requestKey, observe a single timeline revision and undo/redo via the same tools. The old MCP regression remains required.
- [x] Task 5: run focused tests, independent review, then the full integration suite and existing Director browser regression because the shared edit path changed. Verify canonical data before/after local integration and preserve logs/checkpoint. No paid generation.

Acceptance uses real parent HTTP/stdio callers, literal frame ranges and actual SQLite state. Tests must catch misrouted tools, partial mutation, replay after another edit, stale preview, unknown fields and coverage-source omission. No automatic model judgment is claimed. Rollback is source reversal; additive receipt rows can remain harmlessly in the journal.

