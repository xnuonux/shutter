# Shutter: continue from a saved take

September 10, 2026. The local studio now has a **Continue from this take** flow in the shot editor.

## What is available

- Preview the actual last frame of the selected video, alongside the ending description frozen with that take.
- Describe the next action, its resulting story state and camera direction.
- Continue directly from the actual ending, or choose a separately composed image for a new camera setup.
- Insert the new shot immediately after its source, preserving other shots and selected takes.
- Retain the exact source take, video, ending frame and recorded ending in the new shot. The editor warns if its preceding selected take later changes or moves.
- Save next-shot drafts in this browser across reloads, scoped to the production and selected take.
- Review carried character conditions and prepare an estimate using the existing controls. Creating a shot never submits a render or reserves credits.

An edited shot description is not evidence of a changed rendered video. Continuation uses the selected take's frozen ending description, clearly labeled for comparison with its actual frame. This does not automatically judge whether the video fulfilled that description.

A related saving bug was fixed: character conditions without a reference image were discarded by the editor. Text-only conditions now survive saving and reach the H3 generation prompt. The preparation summary now accurately calls these character conditions rather than counting them as image references.

## Concrete result in the studio

The rain she brings home is revision 14, with the original six selected shots and a new seventh draft, **The observatory wakes**. Its opening is the real final frame of the Sol close-up. The new action has Sol place the only sphere in the brass console cradle and withdraw empty hands. His condition note explicitly distinguishes ownership at the opening from the end of this new action.

The browser flow created and saved the shot, then prepared its estimate through the ordinary editor. Job job_fca8b216-e754-4f82-bf59-48e2429ec307 is **prepared only**, with no provider ID or charge. The quoted five-second 480P H3 Max I2V cost is $0.0625; quote expiry and live pricing must still be checked before submission. Source job job_ada71234-4cf0-43bd-8a7b-a2776bf36512 and actual ending asset_bf3d4cbf33bc0dc41137591cfd7a5f4298020cc1da7a888394db3b79ca18277e remain linked.

No fal spending this milestone. Tracked available funds remain **$4.78404**: text $0.9375, image/reference $3.64654, reserve $0.20. No active or unknown request, no reservation. The previous 31-second review cut is still available; the new draft has no footage and is not in that exported cut.

## Verification

All 33 Node tests passed after implementation. Focused tests also passed after adding the new-camera positive case. Tests exercise real HTTP creation, decoding an actual saved video ending, frozen story-state use, insertion order, selected-take preservation, rejection of stale revisions and unselected sources, required new-angle images, and the text-condition path into the generation prompt. Browser verification created the real draft, recovered its form after reload, saved conditions with no images, and prepared the expected quote without spending. The rendered editor was inspected at the available narrow viewport with no horizontal overflow. Syntax and whitespace checks passed.

Source additions: src/continue-shot.mjs, public/next-shot.js, test/h3-ui.test.mjs. Existing server, app, H3 form, preparation summary, styles and workflow tests were updated. No deployment or publication. Existing local work remains uncommitted and preserved.

## Practical limits and next step

The flow imports/chooses already composed images; it does not call image generation automatically. Carried character conditions must be reviewed because a prior action can change them. An ending image can be added in the existing editor when a precise final arrangement matters. This is a guided continuity workflow, not automatic continuity scoring.

For the prepared placement shot, compose the final console arrangement before rendering if precise sphere seating and hand separation are the priority. An episode-scale demonstration still needs dialogue and voice continuity, pacing, varied staging and deliberate editing. The original Moment mode remains available.
