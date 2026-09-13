# Studio workspace · September 12, 2026

The media studio now presents one editing workspace with Material on the left, a persistent Program viewer and picture timeline in the center, and contextual tools on the right. Sound, Finish and Deliver have dedicated views; playback controls remain available in Sound and Finish. The new workspace is implemented on the existing media journal, room controllers and edit commands.

## What changed

- The long introductory page is replaced by a compact production picker and save controls. Creating a production uses a dialog; cancelling it preserves the current project. The picker correctly reflects directly opened productions.
- Material has actual local video/image thumbnails, filename search and a media-type filter. Source preview and preparation controls remain separate from the film. Source selection clears when a different production loads successfully.
- The program and complete picture timeline fit together at 1440×1000 and 1280×800. The frame clock, song waveform, shot controls and scene coverage remain in the same editor. Detailed settings stay available in expandable sections.
- Generate and Compare takes open for the selected timeline shot. An unfinished generation direction survives workspace changes; changing its target asks before discarding it. A newly created unsaved shot keeps its own target and cannot silently fall back to another saved clip.
- Production Memory remains available as Moments and Takes. Generated candidates still require their existing review and explicit application path. Quote and spending controls were retained.
- Mobile Material opens as an overlay in the current viewport. Tool tabs support keyboard activation; editor shortcuts no longer intercept Space on a focused button or tab. Closing the material overlay restores its trigger focus.
- Failed production switching retains the old picker selection and local recovery copy. Save/Undo/Redo, format settings and contextual shot actions respect unresolved draft recovery after their relocation.

The visual system uses slate surfaces (#171d25 / #202732), readable cool text (#edf1f5), muted secondary text (#a8b3c2), and warm selected-shot/action accents (#e6bc7a). Coverage remains green to distinguish alternate views. Typography uses the locally available Segoe UI Variable family with system fallbacks. No remote fonts, frontend framework, image-generation service or new provider was introduced.

## Evidence

- Full Node suite: 471 tests, **469 passed, 0 failed, 2 skipped**. The two skips are existing Windows file-symlink privilege limitations; directory-junction protections ran.
- Real workspace browser checks: **16 passed**, including full/compact desktop visibility, exact generation target, pending direction, keyboard behavior, failed-switch recovery, an unsaved new-shot target, header recovery locks and mobile access. Navigation left the saved timeline unchanged.
- Real import → edit → replacement → coverage → save/reopen → playback → export: **12 passed** using existing H3 footage copies and a quiet test WAV. The 240-frame rendered cut retains the established coverage and elapsed source timing.
- Existing combined Music/Sound/Finish/Memory component fixture: **38 passed**. Generate component: **11 passed**. These isolated fixtures qualify UI contracts, not live provider output.
- Independent source review identified the failed-switch recovery issue and contextual-selection risks. They were addressed and reviewed again. Context actions are disabled under the same recovery condition as header save controls.
- Rendered UI inspected at desktop and mobile sizes. The HTTP test checks delivery of the workspace document and its actual JS/CSS entry points through the parent server.

Browser fixtures wait for the document and specific application readiness states. Local video range requests can continue after navigation; network-idle is not used as a proxy for an editor being ready. Existing raw verification artifacts remain local and are not included as application source.

Code and canonical integration are local. Remote branches and the nine draft PRs were not changed. Original canonical production data is not migrated or replaced. This pass used no paid provider calls and spent **$0**.

## Resume

Canonical source: `C:/dev/shutter`. Retained integration worktree: `C:/dev/.worktrees/shutter-integration-20260912`, branch `codex/shutter-integration-20260912`.

Review workspace: `http://127.0.0.1:4688/media-studio?project=prod_59aeb99c-e35a-4cee-902b-bf1cda2c9427`. It uses disposable data under `work/browser-studio`. Canonical studio remains at localhost4677 with the original data directory. Recheck process ownership before restarting either server; the launch environment is preserved in the integration worktree's `work/env.ps1`.

Task evidence: `outputs/shutter/studio-workspace-2026-09-12/`, including the actual desktop/Generate/mobile captures, browser receipts, test logs and reused-footage edit proof. Reproduce with the existing runtime environment and `node --test --test-concurrency=2 test/*.test.mjs`; browser scripts are `test/browser/studio-workspace.py` and `test/browser/studio-integration.py` (see the takeover integration result for runtime/manifest paths).

Next bounded product work is to connect scene intent and continuity notes to explicit shot proposals in this workspace. Pixel orchestration and semantic scene understanding remain unfinished; the node canvas is still a separate earlier capability. Preserve typed edit operations and the artist's acceptance step. No new provider is necessary to develop that handoff. Before another paid continuity study, refresh the actual fal balance and existing receipts; the old balance snapshots and separately unfunded future commercial deposit are not spendable assumptions.
