# Shutter production workflow

The tested process is now part of the existing production editor and review screen. September 9, 2026, America/Chicago.

## What is available

**Prepare the shot.** The production screen summarizes the assigned cast, location, opening image and recorded entering/leaving states. Current appearance and scene reference controls are expanded in the editor. Existing footage, Moment, shot settings and earlier cuts remain intact.

**Review the cut boundary.** The review screen shows the preceding selected take's actual last picture frame beside the inspected candidate's actual first picture frame, with their story-state descriptions. Frames are decoded from the saved videos and cached as immutable assets. Loading them does not call a generation provider. The full take and detailed review criteria remain available below the comparison.

**Inspect candidates without changing the cut.** The candidate dropdown changes only the preview. A take selected for a review cut starts as a candidate, not an automatically accepted result.

**Make an explicit decision.** “Accept this take for the cut” records acceptance and selects that exact take. “Needs revision” requires a concrete note and leaves cut selection unchanged. Earlier decisions remain in the record. If relevant shot inputs, sound/dialogue, review details or the preceding selected take/ending state change, the old acceptance is displayed as “Review again.” A production-title-only edit does not invalidate it. A stale browser cannot accept a newer context using an older review hash.

**Revise the affected shot.** The revision note follows the inspected take back into the editor. Editing the shot preserves the other selected takes and previous exports. Preparing the revised brief still uses the existing immutable-input and cost-estimation path; it does not submit a render automatically.

**See costs.** The production and review screens show available funds, actual spending, pending reservations and the separate text/image-reference/reserve allocations. Individual takes display estimated and actual charges, or identify reused footage with no new generation charge.

## Verified behavior

- All 30 Node tests passed, including real HTTP acceptance/revision requests, stale context rejection, relevant-change invalidation, actual frame extraction and portable export of comparison images.
- Existing media assembly, budget limits, duplicate submission protection, source immutability and MCP tests still pass.
- Browser testing loaded real 832 × 480 comparison frames, inspected an older candidate, saved a revision note and confirmed all four selected take IDs remained unchanged.
- A reproduced browser bug that cleared an unsaved acceptance note when saving detailed review was fixed and checked again in the browser.
- Independent read-only code review completed. Its initial objection to accepting and selecting in one action was withdrawn after checking the explicit button wording. Additional local checking found and fixed sound/dialogue changes not invalidating acceptance.
- Browser JavaScript syntax and whitespace checks passed. The running local app was restarted on the updated source. No external deployment or publication occurred.

The older wide indoor take now records a concrete revision request because its wetness was hard to read. The improved composed take remains selected in the current cut and is still a candidate. No broad artistic approval was fabricated during workflow testing.

## Funds and limits

No paid generation or image generation occurred in this update. Remaining task allocation is unchanged at **$4.90904**: **$0.9375 text**, **$3.77154 image/reference**, **$0.20 reserve**. There are no active paid jobs or unresolved reservations.

This is a human review workflow. It does not automatically score facial identity, infer a story bible, certify a whole episode or prove every frame from two stills. The next paid experiment remains the proposed prop handoff across separate renders; it was not started here. The future commercial's separate $10 remains unfunded.
