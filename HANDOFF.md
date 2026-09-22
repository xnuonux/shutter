# Shutter: Codex handoff to the next agent

Prepared September 22, 2026, at Dom's request. Continue from these milestones without repeating the completed research or paid renders. This handoff preserves the product's ambition and the exact limits of the work so far.

## Start here

The continuation branch is [`codex/shared-scene-timeline`](https://github.com/xnuonux/shutter/tree/codex/shared-scene-timeline), the current default branch of `xnuonux/shutter`. The implementation through **4ad5617** was already integrated locally; this handoff adds documentation only. Check the current branch and worktree before editing, since another agent may have advanced them.

Read this file, [current checkpoint](docs/current-checkpoint.md), and [Director action guide](docs/director-action-guide.md). Use [the founder-approved vision](VISION.md) and [product blueprint](docs/product-blueprint.md) when making product decisions. Older dated documents are historical evidence, not automatically the current implementation.

Shutter is intended to become a beautiful, standalone AI-native cinema product: an approachable directing interface, visual composition and a usable editing timeline, with original characters, environments and story remaining coherent across many shots. Preserve Moment, the existing Lunari/Blender work and the artist's own footage placement. The current editor and agent tools are substantial foundations; the whole commercial product is unfinished.

## What is already implemented

| Milestone | Delivered behavior | Evidence / source entry point |
| --- | --- | --- |
| Integrated media Studio | Camera/generated footage, images, audio, timeline editing, sound lanes, text finishing, color preparation, media recovery, Production Memory, Take Stacks and governed H3 inserts | [Takeover](docs/takeover-integration-2026-09-12.md), [workspace](docs/studio-workspace-2026-09-12.md), `src/media-api.mjs`, `public/media-studio.js` |
| Shared scene time | Alternate coverage replaces the same scene interval, can span main-shot boundaries, and returns at elapsed source time | [Timing rule](docs/scene-time-and-coverage.md), [coverage](docs/director-coverage-2026-09-13.md) |
| Deterministic director actions | 31 versioned editing actions; bounded batches, revision checks, exact previews, reversible application and persistent retry receipts | [Action guide](docs/director-action-guide.md), `public/action-contract.mjs`, `src/director-actions.mjs` |
| Grounded direction and proposals | Source discovery, attributed moments and direction, proposals bound to their source/direction context, evidence before applying a cutaway | [Workflow](docs/director-workflow-2026-09-13.md), [binding](docs/proposal-binding-2026-09-13.md), [evidence](docs/director-evidence-2026-09-13.md) |
| Source and composed-scene inspection | Actual ordered source images; saved composite review with visible coverage, burned text, authored sound, seekable MP4 and optional explicit audio | [Source inspection](docs/source-inspection-2026-09-13.md), [scene review](docs/scene-review-2026-09-14.md), `src/mcp.mjs` |
| A real director exercise | Codex inspected footage, saved observations/intent, edited, reviewed an observed mismatch and revised the cut through actual MCP calls | [Complete case](docs/director-exercise-2026-09-14.md), commit `6d1e858` |

There are 13 Studio/workflow MCP tools plus the legacy production tools. Discover current schemas through `shutter_action_catalog` and context through `shutter_studio_context`; do not infer valid parameters from this summary. The guide records the full calling sequence.

## The latest film and what it demonstrated

**A burden shared · director working cut** is 13.5 seconds, 324 frames at 24 fps, 832 × 480, with aligned original take audio. Review production `prod_61bf252d-9459-4354-b723-fc11a714fb36` is saved at revision 6 in the retained review database.

The three existing H3 sources show Mira handing the orb to Sol, his acknowledgement, then placement into the console. Main lengths are 96, 104 and 124 frames. A 27-frame unused wide from the first take covers scene interval `[197,224)`, across the separate-render join at frame 200. Returning at frame 224 resumes placement at source frame 24, one second into that source. The main timeline continues beneath coverage.

The first proposal returned nine frames earlier. Composed image review showed Sol's gaze too high on return, so Codex revised the saved direction and applied a fresh preview moving coverage nine frames later. The revised sampled image improved that specific match. Five persisted action receipts retain revisions 2–6. No new generation was needed.

This wide is compatible held-state material from an earlier take, not a synchronized second camera. Sampled images leave motion gaps. The client could not hear audio: timing and browser decoding were checked, listening quality was not. No artist continuity acceptance, complete-video perception, external director-client certification or episode certification is claimed.

MP4 SHA-256: `a9dd37fad7ef5ea70b8f5ce93c9f20379bdfdd3b2bfd3e85fcde8fd5b43e1f78`.

## Next implementation: let the director set up its own Studio project

The exercise exposed a concrete missing fundamental. Production creation and source imports required existing HTTP APIs before MCP could take over. Complete discoverable MCP creation/import contracts, then prove an agent can start with local footage and proceed through the existing edit/review/revision loop.

Start with `src/mcp.mjs`, `src/director-tools.mjs`, `src/media-api.mjs`, `src/media-edit.mjs` and `src/media-io.mjs`. Existing routes are `POST /api/media/productions` and streaming `POST /api/media/assets?name=...`. Reuse their services and media validation. Inspect the actual implementation before choosing the bridge contract; a local import must not quietly become arbitrary remote downloading or unrestricted server-side file access.

Completion conditions for this next milestone:

1. A director can discover the creation/import schemas, create a Studio production, import an authorized local media file and identify the returned production/asset in fresh context.
2. Validation and retry behavior are explicit. A malformed, inaccessible, over-limit or unsupported input fails clearly without a half-valid production/edit; uncertain responses have a documented recovery path that avoids accidental duplicate setup.
3. The imported source can enter the existing preview/apply/receipt/review loop through the actual stdio MCP bridge. Verify real callers and resulting persisted state, not only helper functions.
4. Tests cover the happy path, relevant failure/retry paths and existing file/spending boundaries. Update the action guide and checkpoint with what actually shipped.
5. This setup milestone performs no paid generation, provider reconfiguration, client subscription migration or change to the underlying scene-time rule.

After that, reassess the product-facing director experience, Pixel orchestration and the remaining UI/Canvas/timeline polish against the vision. Keep those larger gaps visible without replacing this concrete next deliverable with another broad redesign or research campaign.

## Run and verify

Node.js 24 or later is required. The app has no package-install step. Configure installed FFmpeg, ffprobe and a Python with PyAV through `SHUTTER_FFMPEG`, `SHUTTER_FFPROBE` and `SHUTTER_PROBE_PYTHON` as needed. Runtime paths are machine-specific; binaries are not bundled in Git.

```powershell
node --test test/*.test.mjs
npm start
```

`npm start` uses loopback port 4677. An empty checkout opens an empty local studio when `data/` is absent. Do not run `npm run seed` to recover missing media: it refers to original development-machine paths. `src/mcp.mjs` connects to the running app; set `SHUTTER_URL` when targeting a different local port. See `mcp.example.json`; no client configuration was installed by this handoff.

Fresh handoff verification on September 22: Node **v24.18.0**, **534 tests, 532 passed, zero failed, two skipped**, about 11.4 seconds. The two skipped file-symlink cases require an OS privilege unavailable on this Windows host. Directory-symlink checks ran. The full log is retained locally under the handoff evidence path below. No new browser/creative review was performed for this documentation-only publication; the dated milestone files retain those earlier results and limitations.

The canonical original journal was rechecked September 22: **78 records, 19 request entries**, unchanged digest `7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663`.

## Local work and evidence to preserve

GitHub holds the source, tests and project documentation. Original media, SQLite state, runtime binaries, cached review files and raw task evidence remain local and are excluded from Git. A GitHub clone does not contain the working films. On Dom's machine:

- Canonical repo/data: `C:/dev/shutter`, branch `codex/shared-scene-timeline`; `data/` holds the original studio.
- Retained worktree: `C:/dev/.worktrees/shutter-integration-20260912`, branch `codex/shutter-integration-20260912`, last verified at `4ad5617`. Its intentionally untracked `verification/` is preserved. Do not delete or reset this worktree to match a cleaner-looking checkout.
- Review database/media: retained worktree `work/browser-studio/`. Launch helpers are `work/env.ps1` and `work/serve.mjs`. They are local-only and run the review app on port 4688.
- Task evidence base: `C:/Users/Dom/Documents/Codex/2026-09-09/codex-threads-019fa76e-328b-7af3-ada3/outputs/shutter/`.
- Latest film and exact requests/responses/media/receipts: `director-exercise-2026-09-14/through-the-handoff.mp4` and its sibling evidence files under that base. Do not blindly replay saved mutation requests.
- Previous implementation evidence: `scene-review-2026-09-14/`. Fresh publication test log: `github-handoff-2026-09-22/full-suite.txt`.

No listeners on ports 4677 or 4688 were present at the September 22 handoff check. The September 14 PIDs in historical notes are stale. Inspect current process ownership before starting, stopping or reusing a local service. No server or new worker was started for publication.

## Budget and durable directing rules

- No paid calls or generation occurred in this handoff or the latest director exercise. Old balances and model prices are stale. Reverify the actual fal balance and persisted receipts before any paid work; never repeat a completed request because a response or notification was missing.
- The future $10 Eternities commercial remains separately unfunded. Its requirements are in [the commercial brief](docs/future-eternities-commercial-brief.md). Do not spend against that future deposit or mix it into the current testing budget.
- Main renders remain immutable takes. Alternate coverage replaces an interval on one shared scene clock; return at elapsed time, without restarting the main render or extending the scene to hide a seam. Source-frame in/out and aligned audio determine the actual cut.
- Preserve research, character references, original Lunari Cinema, Moment and Blender assets. Keep provenance and licensing boundaries in `THIRD_PARTY.md`. A source URL or model reputation is not evidence that a client perceived video/audio or that episode-scale continuity is solved.

From Codex: the valuable next move is to close the small setup gap and prove the entire director workflow from a fresh project. The editing/review/revision mechanism has real evidence now. Build on it, keep the artist's film central, and carry each authorized change through to a working result.
