# Source pictures for Director decisions

September 13, 2026. This milestone connects the 31-action editing contract to actual local footage and saved scene intent. It adds an inspect step between preview and apply, beginning with cutaway entry and return. The artist and any connected vision-capable director can compare pictures at the same scene time before deciding whether alternate coverage belongs in the cut.

## Implemented

- The Director panel shows four paired comparisons using up to six original-source JPEG frames. Scene-edge omissions are explicit; neighboring coverage and main-shot boundaries use the compiled picture plan.
- Extraction uses the exporter's preserved sampling phase, rate conversion and fit. The underlying main and alternate frames are sampled at the same scene positions. This preserves the approved shared scene clock.
- Saved goals and continuity notes accompany the manifest as artist-authored intent. Context reports missing directions rather than inventing them.
- Evidence is tied to the exact preview, project revision, coverage selection and saved intent. Changes during extraction reject the old request. Reading evidence never changes the timeline, undo history or provider queue.
- `shutter_inspect_cutaway` returns the manifest and actual labeled JPEG image blocks through the existing local stdio MCP bridge. `includeImages: false` returns metadata only. Existing editing and legacy tools remain available.
- Cache reuse verifies image bytes and original sources. Failed extraction removes its own partial directory. Local image routes verify project scope, paths and byte hashes. No new dependency or service was introduced.

The calling sequence, role table and limits are documented in [the Director action guide](director-action-guide.md).

## Verification

The focused tests exercise the real parent HTTP server, journal, source decoder, exporter and stdio MCP bridge. Literal positions cover scene frames 35, 36, 59 and 60, alternate coverage spanning two main clips, adjacent coverage, still sources, and 30 fps material in a 24 fps cut. Extracted picture values are compared against the actual local export. The main view returns at elapsed scene time.

Failure tests cover stale revisions and hashes, changed intent during decoding, cancellation, altered source bytes, damaged thumbnail caches, foreign project frame access and record identity conflicts. MCP tests reject changed manifest bindings, invalid local routes, redirects, oversized image streams and incorrect image hashes. Manifest-only mode does not fetch image bytes. The real MCP round trip receives six image blocks and leaves the edit unchanged.

Final suite: **516 tests, 514 passed, zero failed, two existing Windows symlink skips**. Ten focused evidence cases are included. The real evidence browser journey passed **13 checks**; the existing Director journey passed **14 checks**; canonical read-only browser verification passed **three checks**. Independent review is resolved. Desktop and mobile screenshots were visually inspected with the comparison pictures in view. A delayed preview test proves changed intent prevents the dependent evidence request.

Code **`3feb51a`** is integrated locally into `C:/dev/shutter`. Canonical localhost4677 was PID29112 at verification. Its new evidence route and shared action module were checked live. The canonical journal remains exactly **78 records and 19 request entries**, ordered raw-SQL `{rows,requests}` SHA-256 `7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663`. No remote merge or deployment occurred.

Browser evidence is under `work/director-evidence/` in the retained worktree and copied to task `01a087ae-15fc-7e43-8eb2-126e7883d103`, `outputs/shutter/director-evidence-2026-09-13/`. It includes desktop/mobile and return pictures, browser receipt, full suite output and canonical preservation checks. The disposable review production is `prod_e7b53477-2288-4906-8bfe-5e36b52af0d5` on localhost4688. The saved proposal is unaccepted; its 96-frame main cut remains unchanged.

## Boundaries and next work

This is inspectable footage evidence, not semantic scene understanding or automatic continuity certification. Single frames do not prove motion consistency. The existing audition and explicit artist review remain necessary. No provider or live third-party LLM session was configured; no generation credits were spent.

The next bounded product step is to expose the remaining existing source-selection and direction operations through equally explicit, revision-aware discovery, then exercise an explained inspect/propose/apply/undo loop. Pixel orchestration should consume these working primitives. Keep automatic semantic claims, synchronized generation and the separately funded commercial distinct from this editing milestone.

Canonical project: `C:/dev/shutter`. Retained worktree: `C:/dev/.worktrees/shutter-integration-20260912`. Previous action code: `db9a436`; prior checkpoint: `d36064e`. Preserve original Lunari, Moment, Blender and all creative records. Reverify actual fal balance and receipts before future spending.
