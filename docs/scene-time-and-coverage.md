# Scene time and overlapping camera coverage

September 10, 2026. **Approved by Dom: "lock it in."** This is Shutter's directing and timeline rule. It is an approved authoring/editing design, not a claim that the timeline feature or seamless generation has already been implemented.

## Locked decision: one scene timeline, replaceable camera coverage

A scene has one shared timeline. A main camera view may span multiple chained renders. Alternate camera renders cover intervals of that same scene time and replace the visible main view during those intervals. They do not add time, pause the underlying action, or restart the main view when they end.

Dom's example: four nominal 15-second main-view renders cover a 60-second scene. An alternate view placed at scene seconds 14–17 replaces those three seconds and covers the main-view render boundary at second 15. Returning to the main view reveals its scene-second-17 frame, not the new render's frame zero. Final runtime remains 60 seconds. The same rule applies at later boundaries and to variable-length renders.

Use actual decoded frame counts and explicit source in/out ranges for the edit; nominal model duration is a planning value, not an exact media timestamp. The 15-second number is the current endpoint constraint, not a universal product constant.

Every camera view must be directed against the same action schedule and world state. Alternate coverage spans the observed settling/reinterpretation interval around a boundary, not merely the single joining frame. Preserve character identity, prop ownership, action progress, eyelines, positions, environment and scene audio. Choose motivated perspectives and pacing; do not automatically insert a rapid cut at every seam.

Implementation acceptance criteria:

- Inserting three seconds of alternate coverage into a 60-second scene leaves its runtime at 60 seconds.
- Returning from coverage resumes the main take at the elapsed scene time; no replay or frozen underlying timeline.
- Source footage stays immutable; frame ranges and coverage choices are reversible and included in exports.
- Audio follows its own choices on the shared scene timeline rather than automatically resetting with each picture cut.
- Editing existing footage cannot trigger paid generation. Generated duration, visible duration and paid editing handles remain distinguishable.

The first product implementation should establish this timeline and source-range behavior using existing footage before further paid continuity experiments. Dom judged the earlier wider-angle alternative better, though rapid; that is feedback on the edit, not validation of synchronized generation.

## Core rule

Camera changes must preserve the intended passage of scene time. The picture shown on screen and the available footage for that time are different things. Multiple generated camera takes may cover overlapping scene time; the final edit chooses which camera is visible.

For A -> B -> C, C may be generated starting from A's actual ending, but C's initial frames run underneath B and are not shown. When the cutaway ends, reveal C at the corresponding elapsed time. Do not concatenate B and then show C from frame zero, which would restart the earlier world state.

Example of a continuous scene:

| Scene interval | Visible view | Sol's action | C render time |
|---|---|---|---|
| 0–5s | A: Sol close-up | Holds sphere, looks to Mira | Not started |
| 5–7s | B: Mira reaction | Sol begins lowering sphere off camera | C 0–2s, hidden |
| 7–10s | C: Sol/console | Continues lowering, seats sphere and releases | C 2–5s, visible |

C's input image is A's ending at scene time 5s. B and C both depict scene time starting at 5s, from different views. A five-second C generation contributes only its final three seconds to this edit. Longer visible footage requires enough generated lead-in within the endpoint limit. These unused lead-in/tail frames are editing handles and must be budgeted.

The director must give B and C the same event schedule and persistent facts. If B includes a visible Sol or console, those actions must agree. If Sol is off screen, his action can be described and sound can carry it, but the return still must match the intended elapsed state. Maintain prop ownership/count, action stage, body position, eyelines/screen direction, wetness, environment conditions and event timing. Do not require simulation of every invisible raindrop or a full 3D world merely to enforce these story facts.

## Other valid cases

- A genuine hold: if Sol waits while Mira reacts, C can legitimately resume the same pose. Direct the wait explicitly and retain ambient life/audio; do not accidentally reset an action that should have progressed.
- A newly composed return: build C's opening for the later scene state after B. A's ending then serves as an identity/location reference, not a mandatory pixel-identical opening.
- A direct change of angle: two shots can cut coherently on action without requiring a third shot. Three shots are one coverage pattern, not a universal minimum.
- A connected action rendered in one take can avoid the inter-render reset within that action. Treat one render as a camera take by default, while recognizing that supported models may also generate internal cuts.

## Product consequence

Shutter's current Continue from this take operation carries a still and frozen story brief but has no shared scene timing or trim controls. It cannot yet execute this pattern as an authored timeline. The next bounded product milestone should support source in/out ranges for selected footage and a recorded scene-time/coverage relationship, preserving original takes and exact audio timing. The planner should distinguish visible duration from generated duration and reserve budget for handles. B should be motivated by the performance rather than inserted for arbitrary filler.

This is consistent with established continuity editing through eyeline/direction matching and cuts on action. Audio can span the picture cut instead of restarting on each camera change. [Adobe continuity editing](https://www.adobe.com/creativecloud/video/hub/ideas/what-is-continuity-editing-in-film.html), [Adobe split audio edits](https://helpx.adobe.com/premiere/desktop/edit-projects/trim-clips/perform-j-cuts-and-l-cuts.html).

The overlap example has not yet been tested as synchronized new generations. The prior coverage-edit.mp4 reused an earlier wide angle and demonstrated a useful editorial disguise, but was not a fully planned common-time camera sequence. Do not retroactively claim it proved this design. Budget remains $4.72154; main production remains revision16 with its original seven selected shots and 36.1667s cut.
