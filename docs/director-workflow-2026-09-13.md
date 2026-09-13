# Source discovery and direction through MCP

September 13, 2026. Shutter now exposes five existing source/direction operations to connected directors: save a source moment, search moments, read direction, save direction, and build shot proposals. Together with the editing and frame-inspection tools, these support a scripted source-to-edit workflow over existing local material. No provider was added or configured.

## Delivered behavior

`src/director-tools.mjs` supplies closed schemas and thin adapters to existing memory/direction HTTP routes. The 31 editing actions remain unchanged. The action catalog links to relevant tools, while MCP tool discovery carries the full argument schemas, side effects, time units and retry instructions.

Moment saves verify existing source files and marked ranges, maintain stable note identity, and check the observed note revision. Direction saves through MCP require both the observed timeline revision and direction revision. The timeline is rechecked inside the existing SQLite write transaction before saving direction. Stale requests fail without overwriting newer work.

The MCP bridge attributes its saved note/direction revisions to the director. Human edits through the existing interface remain artist-authored. Provenance survives lexical search, proposal candidates, Take Stack snapshots, Studio context, frame evidence and the interface. Old records default to their existing artist attribution; no migration rewrites original creative data. These labels describe the authoring path, not verified truth or authenticated identity.

## Verification

Five new tests use an actual stdio MCP client against the real parent HTTP server and local media. The complete path marks a source, searches it, saves direction, proposes coverage, previews the returned command, receives six source pictures, applies once and undoes the edit. Literal coverage positions are frames 36 through 59, with main footage returning at source time 2.5 seconds. The source/direction work itself leaves the cut unchanged and never submits a job.

Other cases reject stale direction and timeline revisions, repeated saves, cross-production note identity, malformed units and forged author fields. Note updates retain their source identity; search and Take Stack snapshots retain attribution; artist saves preserve the legacy behavior.

Full suite: **521 tests, 519 passed, zero failed, two existing Windows symlink skips**. Seven new browser checks verify actual provenance labels, frame evidence, artist revision of a director note, and unchanged timeline. Fourteen existing Director browser checks pass. The rendered provenance screenshot was visually inspected. Independent read-only review is resolved.

## Limits and continuation

The protocol test is a scripted client, not a certified live third-party LLM director. Source search matches authored words. Shutter does not invent visual observations or approve continuity. No generation credits were spent.

General action preview/apply binds the timeline and source plan; it does not atomically bind the chosen command to later edits of its source note or direction. A caller must rebuild stale proposals, and applying a command does not stand in for the UI's artist-review checks. A useful next step is binding a selected proposal's context through preview/apply while preserving this distinction.

Import, production creation, source scouting, Take Stack review, color, delivery and generation retain their existing app/API paths. Do not advertise them as fully covered by these five tools. Read [the calling guide](director-action-guide.md) for exact tool names, revision conventions and uncertain-response recovery.

Canonical project: `C:/dev/shutter`. Retained worktree: `C:/dev/.worktrees/shutter-integration-20260912`. This milestone starts at `6de53a6`. Final local integration and preservation observations are recorded in the current checkpoint. Durable task evidence lives in `outputs/shutter/director-workflow-2026-09-13/` under task `01a087ae-15fc-7e43-8eb2-126e7883d103`.
