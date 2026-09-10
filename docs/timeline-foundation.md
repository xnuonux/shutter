# Shared scene timeline: first working foundation

September 10, 2026. Implemented locally on codex/shared-scene-timeline. This is an editing milestone, not a claim that Shutter is complete or that independently generated performances are synchronized.

## Standing direction

Dom wants Codex to continue inline toward Shutter's completion, establish and test the fundamentals before adding another reasoning provider, and reuse any useful code from his Lunari Cinema or GitHub repositories. His unused Claude subscription is available later; do not activate or mix in another provider as part of this milestone. Existing generation budgets remain binding. Routine local implementation and testing do not need another go/approval.

## Implemented

- A saved timeline separate from changing generation briefs, bound to the same production and immutable take IDs.
- Main footage uses explicit integer source in/out frames. Main clips can be trimmed, reordered, removed or appended.
- Alternate coverage replaces an interval of the same scene time. The main performance continues underneath; returning selects its elapsed source frame.
- Visual Timeline room with main, coverage and scene-audio lanes, numeric frame-snapped placement, coverage dragging, source preview, undo/redo and a saved-cut preview/download.
- Revision checks protect concurrent edits; undo/redo history survives restart. Original assets and render jobs are unchanged by editing.
- Local export decodes the exact compiled video ranges; audio follows the main scene ranges independently of coverage. Preview plays this exact exported MP4, so it has the same frames and sound as the download.
- Two additional MCP tools, shutter_get_timeline and shutter_save_timeline, call the same HTTP/store path as the editor. Total local tool count is now ten. No new LLM/provider integration.
- Production manifests include the saved timeline and its edit history. Older cuts are preserved.

## Evidence

37 Node tests pass, including a full-minute timing fixture, saved/reopened edits, undo/redo, invalid ranges, overlap rejection, HTTP callers, an actual MCP save/conflict round trip and actual encoded/decoded export pixels and audio. The new tests failed before implementation: absent timeline route/method, wrong rendered coverage frame, absent MCP timeline tool.

The one-minute fixture places alternate coverage at scene seconds 14-17 and verifies exactly 1,440 frames at 24 fps. It returns to the second main take at source frame 48, not zero. Main audio ranges remain unchanged.

The actual export fixture checks specific pixel colors immediately before coverage, at coverage start/end and at the resumed underlying source. It separately checks sound/silence/sound through the edit, including coverage over a main audio boundary.

Browser verification on the existing production:

- Added a previously generated alternate angle using source seconds 1-3 at scene seconds 30-32.
- Runtime stayed 868 frames / 36.1667 seconds; exporter returned to the final main take at source frame 24, scene second 32.
- Built and opened a preview from the saved edit. Coverage test cut: cut_4e7771c36ffe99e4ba9dea7cfebaf75abd288310f779039b3038de943a3a3148.
- Undid/redid placement, dragged coverage to a new scene time, and undid the timing experiments.
- Reloaded the browser and recovered saved edit 8.
- Trimmed 0.5 seconds from the first main clip: runtime became 35.6667 seconds. Undo restored 36.1667 seconds.
- Final saved timeline revision 10 contains the original seven full takes, no coverage. Production revision 16 and selected takes remain unchanged. A baseline preview is built from this restored timeline.

The reused alternate angle in the coverage test is an editing fixture, not a newly directed synchronized performance or a recommended final creative cut. No paid generation calls were made. Budget remains $4.72154, with $0.9375 text, $3.58404 image/reference and $0.20 reserve, as verified from the running studio.

## Reuse and limits

Lunari's pure source-range editing model informed the implementation. This milestone adapts that model to Shutter's existing small JavaScript store; it does not transplant the React/OTIO editor wholesale. Relevant source pointers and further reuse candidates remain in the pixel architecture review saved in the task outputs.

First implementation intentionally supports one main picture sequence and one non-overlapping replacement coverage lane. Audio follows the main takes; there is no independent audio selection/mixer yet. All sources must share the timeline's integer frame rate. Transitions, variable frame-rate conforming, a fast live compositor, camera/state scheduling, project-wide human locks and full Pixel orchestration are not complete.

Saved timeline choices are explicit: selecting another generation candidate or adding another planned shot does not silently rewrite an existing edit. The editor can append ready footage. Preview currently requires a local export after an edit; it is not real-time compositing.

Next work: qualify the editor on a deliberately directed coverage scene, add efficient preview and clear take replacement, then extend Pixel's scene-state and review tools on this same command surface. Keep reasoning-provider integration deferred until the fundamentals are stable. Further paid continuity tests must have a specific hypothesis, bounded quote and remaining-budget check.
