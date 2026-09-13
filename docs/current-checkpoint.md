# Current checkpoint: Director can inspect cutaway source pictures

September 13, 2026. Shutter now connects its 31-action editing vocabulary to actual footage and saved scene intent. Read [the evidence result](director-evidence-2026-09-13.md) and [Director calling guide](director-action-guide.md) first. The [action foundation](director-actions-2026-09-13.md), [cutaway result](director-coverage-2026-09-13.md), [workspace result](studio-workspace-2026-09-12.md), [takeover integration](takeover-integration-2026-09-12.md) and [approved vision](../VISION.md) preserve the larger product context.

## Current capability

Director's **Compare cut boundaries** shows four paired comparisons for a proposed timed cutaway: entry across the cut, main/alternate at entry, main/alternate at the last coverage frame, and returning across the cut. Up to six original-source pictures use the exporter's exact sampling phase and framing. Main time keeps advancing underneath. Scene-edge omissions and adjacent coverage are handled explicitly.

The sixth Studio MCP tool, `shutter_inspect_cutaway`, returns the same preview-bound manifest, saved artist intent and actual labeled JPEG images to a vision-capable client. Metadata-only mode is available. Context now includes saved shot goals and continuity requirements. Local evidence extraction is bounded and cached; stale revision, intent and source changes are rejected. It does not edit, submit generation, or grant continuity approval.

The existing `shutter-actions-v1` catalog supplies 31 closed command schemas. Discovery, context, preview, apply and receipt lookup remain intact. A batch of 1-32 commands commits as one revision/undo step with a durable request receipt. Repeating identical input cannot repeat an edit; changed inputs conflict. Timeline and receipt save atomically in the existing journal.

Director saves per-shot goals and source-search words, finds artist-described moments, auditions whole-shot replacements or timed coverage, and retains explicit artist review. Original Direct/Canvas/Moment, Studio Material/Program/Timeline, Generate, Takes, Moments, Sound, Finish, Deliver and recovery remain available. Preserve original Lunari and Blender work.

## Verified and locally integrated

Code **`3feb51a`** is integrated in `C:/dev/shutter`, branch `codex/shared-scene-timeline`. Retained worktree: `C:/dev/.worktrees/shutter-integration-20260912`, branch `codex/shutter-integration-20260912`. Previous action code was `db9a436` and its handoff `d36064e`. No remote merge, deployment or client configuration change occurred.

- Full suite: **516 tests, 514 passed, zero failed, two existing Windows symlink skips**.
- Ten focused evidence cases include the real HTTP decoder/exporter and actual stdio MCP round trip returning six verified images. Mixed 30/24 fps frames are compared with the actual export. Still, scene-edge, adjacent-coverage and two-main-shot cases pass.
- Thirteen real evidence browser checks and fourteen existing Director checks pass. Desktop/mobile comparison pictures were visually inspected. Changing context during an awaited preview prevents obsolete extraction; extracting alone preserves review checkboxes. Changed context resets acceptance checks.
- Canonical browser verification: three read-only checks pass. The new evidence route rejects malformed input before work and the shared action module serves successfully.
- Original canonical data: **78 records and 19 request entries unchanged**, raw ordered `{rows,requests}` SHA-256 `7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663`.

Canonical app: `http://127.0.0.1:4677`, PID29112 at verification. Disposable review: `http://127.0.0.1:4688/media-studio?project=prod_e7b53477-2288-4906-8bfe-5e36b52af0d5`. Open Director, select the saved alternate source candidate, then Compare cut boundaries. The proposal is unaccepted and its 96-frame main cut remains unchanged. The review server was restarted from the integrated source this milestone; the prior optional-restart hold is resolved.

Runtime files remain `work/env.ps1`, `work/serve.mjs`, `work/test-python/Scripts/python.exe` in the retained worktree. Check actual process ownership before restarting. Intentionally untracked `verification/` remains preserved there.

## Spending and remaining work

**$0 spent this milestone, no paid provider calls.** The earlier $4.72154 balance is stale; the September 12 study's $2.26172 is spending, not a current balance. Reverify actual fal balance and receipts before paid work. Do not repeat completed H3/Max studies. The future $10 Eternities commercial remains separately unfunded.

Frame evidence is not semantic understanding or proof of motion continuity. Its unmanaged pictures omit sound and titles; scene audition and explicit artist judgment remain necessary. No live external LLM director session is certified. Automatic scene understanding, Pixel orchestration, synchronized camera generation, and composition-wide color management remain incomplete.

Next bounded step: expose the remaining existing source-search, selection and direction operations through equally clear discovery and revision-aware commands, then exercise an explained inspect/propose/apply/undo loop. Imports, production creation, source scouting, direction authoring, Take Stack review, color, delivery and generation retain existing app/API workflows; they are not all yet in the Studio action catalog. Keep provider setup deferred while completing these fundamentals.

Latest durable task evidence: `outputs/shutter/director-evidence-2026-09-13/` under task `01a087ae-15fc-7e43-8eb2-126e7883d103`. Raw prior receipts and completed research remain in their dated folders. Consult the approved vision before expanding scope.
