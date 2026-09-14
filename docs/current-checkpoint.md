# Current checkpoint: chosen proposals bind their creative context

September 13, 2026. A chosen shot proposal now carries its source-note and directing context through preview, frame evidence and atomic apply. Read [the binding result](proposal-binding-2026-09-13.md) and [Director calling guide](director-action-guide.md) first. The [source/direction result](director-workflow-2026-09-13.md), [evidence result](director-evidence-2026-09-13.md), [action foundation](director-actions-2026-09-13.md), [cutaway result](director-coverage-2026-09-13.md), [workspace result](studio-workspace-2026-09-12.md), [takeover integration](takeover-integration-2026-09-12.md) and [approved vision](../VISION.md) preserve the larger product context.

## Current capability

The optional `proposal: {proposalId, momentId}` binding accepts exactly one unchanged candidate command. Preview, evidence and receipts retain its `proposalContext`. Changes to direction or the marked source note reject the choice, including different contents under deleted/recreated IDs with the same revision number. Apply rechecks inside the timeline/receipt transaction. Completed receipt retries return their original result after later context changes without repeating the edit. Ordinary batches and undo/redo remain available without a binding. Artist acceptance shares the final context check and keeps its explicit review requirements.

Five tools save/search marked moments, read/save direction, and build shot proposals through the existing app services. Closed schemas declare timing, revisions and side effects. MCP direction saves require both the observed timeline and direction revision. Notes saved through the bridge are director-authored; artist edits retain artist attribution. The complete scripted source-to-edit test now carries the selected binding through evidence, apply, retry and undo without generation.

Director's **Compare cut boundaries** shows four paired comparisons for a proposed timed cutaway: entry across the cut, main/alternate at entry, main/alternate at the last coverage frame, and returning across the cut. Up to six original-source pictures use the exporter's exact sampling phase and framing. Main time keeps advancing underneath. Scene-edge omissions and adjacent coverage are handled explicitly.

`shutter_inspect_cutaway` returns the same preview-bound manifest, saved intent with authorship and actual labeled JPEG images to a vision-capable client. Metadata-only mode is available. Context includes saved shot goals and continuity requirements. Local evidence extraction is bounded and cached; stale revision, intent and source changes are rejected. It does not edit, submit generation, or grant continuity approval. There are now eleven Studio/workflow MCP tools in addition to the legacy production tools.

The existing `shutter-actions-v1` catalog supplies 31 closed command schemas. Discovery, context, preview, apply and receipt lookup remain intact. A batch of 1-32 commands commits as one revision/undo step with a durable request receipt. Repeating identical input cannot repeat an edit; changed inputs conflict. Timeline and receipt save atomically in the existing journal.

Director saves per-shot goals and source-search words, finds artist-described moments, auditions whole-shot replacements or timed coverage, and retains explicit artist review. Original Direct/Canvas/Moment, Studio Material/Program/Timeline, Generate, Takes, Moments, Sound, Finish, Deliver and recovery remain available. Preserve original Lunari and Blender work.

## Verified and locally integrated

Code **`a524e2d`** is integrated in `C:/dev/shutter`, branch `codex/shared-scene-timeline`. Retained worktree: `C:/dev/.worktrees/shutter-integration-20260912`, branch `codex/shutter-integration-20260912`. Previous workflow code was `60455aa` and its handoff `30ae9fd`. No remote merge, deployment or client configuration change occurred.

- Full suite: **525 tests, 523 passed, zero failed, two existing Windows symlink skips**. Thirteen action HTTP/MCP tests passed after the final catalog wording change.
- Four added tests cover stale notes/direction, deleted/recreated identities, stripped/changed/foreign binding, the commit transaction race, and deleted notes during real evidence decoding/cache reuse. The complete MCP workflow now proves binding and historical replay. Fourteen evidence browser checks and fourteen artist Director checks pass; desktop pictures were visually inspected. Independent review found no concrete issue.
- Ten focused evidence cases include the real HTTP decoder/exporter and actual stdio MCP round trip returning six verified images. Mixed 30/24 fps frames are compared with the actual export. Still, scene-edge, adjacent-coverage and two-main-shot cases pass.
- Previous evidence milestone: thirteen real browser checks passed and desktop/mobile comparison pictures were visually inspected. Changing context during an awaited preview prevents obsolete extraction; extracting alone preserves review checkboxes. Changed context resets acceptance checks.
- Canonical browser verification: three read-only checks pass. The new evidence route rejects malformed input before work and the shared action module serves successfully.
- Original canonical data: **78 records and 19 request entries unchanged**, raw ordered `{rows,requests}` SHA-256 `7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663`.

Canonical app: `http://127.0.0.1:4677`, PID41924 at verification. Its live catalog describes the selected-proposal binding; three read-only canonical browser checks and the preservation comparison pass. Review server: localhost4688. This milestone's disposable review production `prod_59e41239-fcb0-4395-b10e-e2a41c280c29` preserves its four-second main cut; the browser test ends with an unsaved offset edit to prove stale-preview withdrawal. Prior review fixtures remain preserved, including `prod_e7b53477-2288-4906-8bfe-5e36b52af0d5` and `prod_0f272424-0d1f-44b8-b536-76a44c7656da`. The latter has an obsolete proposal after an artist note edit and must be rebuilt before use.

Runtime files remain `work/env.ps1`, `work/serve.mjs`, `work/test-python/Scripts/python.exe` in the retained worktree. Check actual process ownership before restarting. Intentionally untracked `verification/` remains preserved there.

## Spending and remaining work

**$0 spent this milestone, no paid provider calls.** The earlier $4.72154 balance is stale; the September 12 study's $2.26172 is spending, not a current balance. Reverify actual fal balance and receipts before paid work. Do not repeat completed H3/Max studies. The future $10 Eternities commercial remains separately unfunded.

Frame evidence is not semantic understanding or proof of motion continuity. Its unmanaged pictures omit sound and titles; scene audition and explicit artist judgment remain necessary. No live external LLM director session is certified. Automatic scene understanding, Pixel orchestration, synchronized camera generation, and composition-wide color management remain incomplete.

Next bounded candidate: make source-range motion inspection/audition discoverable to a director, using the existing player and local media services. Boundary pictures cannot establish action over time. Bound proposal edits now protect the selected creative context; independent unbound batches protect timeline/source plans. Neither substitutes for artist-reviewed Take Stack selection. Import, production creation, source scouting, Take Stack review, color, delivery and generation retain their existing app/API workflows. Keep provider setup deferred while completing these fundamentals.

Latest durable task evidence: `outputs/shutter/proposal-binding-2026-09-13/` under task `01a087ae-15fc-7e43-8eb2-126e7883d103`. Raw prior receipts and completed research remain in their dated folders. Consult the approved vision before expanding scope.
