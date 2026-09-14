# Director exercise: a burden shared

September 14, 2026. Codex completed an inline director exercise through the actual local stdio MCP bridge, using existing H3 footage. The result is a **13.5-second working cut**, 324 frames at 24 fps, 832 × 480, with the original take audio. No generation was requested and $0 was spent.

Review production: prod_61bf252d-9459-4354-b723-fc11a714fb36 on localhost4688, saved timeline revision 6. Title: A burden shared · director working cut. The earlier rain demo and canonical original productions remain preserved.

## Observed action and editing decision

The three source inspections returned six chronological images each. They show Mira handing the orb to Sol, Sol acknowledging her, and Sol placing it in the console. These are observations of sampled images, not a claim of complete video perception. The notes are saved as director-authored moments, with source IDs and exact ranges.

A baseline assembly used all 124 frames of each source, totaling 15.5 seconds. The first edit shortened the handoff to 96 frames and the acknowledgement to 104 frames, keeping the visible transfer and look toward Mira while removing two seconds of held poses. Placement remains 124 frames. The main scene now totals 324 frames, 13.5 seconds.

The transition from acknowledgement to placement joins two separate close renders with similar starting/ending poses. The unused wide tail of the handoff take shows Sol holding the orb and looking down while Mira stands with empty hands. It was marked as a candidate to cover a stable hold. Its note explicitly says this is an earlier take, not a synchronized second camera.

The first bound proposal placed that wide coverage at scene frames [188,215), using source [4,5.125) seconds. After preview, exact cut-boundary evidence and apply, the composed review showed a specific mismatch: Sol looks down in the wide, but the return close shot at frame 215 still has a higher gaze. The saved direction was revised, and a fresh preview/apply moved the same 27-frame coverage nine frames later to **[197,224)**. It still covers the render join at frame 200. The new return is source frame 24, one second into placement, where the inspected picture has his gaze lowered.

Moving coverage changes no main duration and does not restart the underlying action. The first candidate, revised candidate, boundary images and edit receipts remain available for comparison. No artist continuity-acceptance flags were set.

## Final picture and sound

| Scene output frames | Visible picture | Source interval |
| --- | --- | --- |
| [0,96) | Handoff wide | Handoff frames [0,96) |
| [96,197) | Sol acknowledgement close | Acknowledgement frames [0,101) |
| [197,224) | Unused wide hold | Handoff frames [96,123) |
| [224,324) | Sol places the orb | Placement frames [24,124) |

Underneath coverage, the main acknowledgement runs to frame 200 and placement starts at 200. The main-source audio follows those same positions, including during the wide shot. The three existing AAC source streams were selected explicitly in Sound Stage, conformed to 48 kHz stereo, set to -3 dB lane gain with 5 ms clip edge fades, and trimmed to the selected main lengths. There is no new music, generated sound, normalization or paid audio call. The final WAV interval is 648000 stereo sample frames.

The final review is scene_review_79920f5c8169f437ceca42e3e5c17e554b694188f7120a2d8e8728e1fe1a025c. Its MP4 SHA-256 is a9dd37fad7ef5ea70b8f5ce93c9f20379bdfdd3b2bfd3e85fcde8fd5b43e1f78. Plan hash: 405b32e9483ba2466b45490646f0bdd5880323750b1db7a1d654feefc361447e.

## Actual tool path and verification

The exercise used discover/context, source inspection, source notes, direction, shot proposal, bound preview/evidence/apply, composed review, revised direction and coverage, sound actions, and a final composed review. Five persisted apply receipts cover baseline revision 2, pacing revision 3, initial coverage revision 4, revised coverage revision 5 and source audio revision 6. The revision after reviewing a mismatch was a model choice based on actual returned images; no scripted heuristic chose it.

Eight assertions verify the saved cut/plan, frame ranges, elapsed-time return, unchanged duration for coverage, sound sample alignment, five persisted receipts, actual MP4 frame/rate/size/audio properties and absence of generation jobs for this production. Five real Chromium checks verify playback duration, audio decoding, seeking both coverage boundaries and the last frame, saved revision labeling and no browser exceptions. The screenshot was visually inspected. The initial browser assertion used a five-second wait that was too short for an uncached complete review; a 30-second wait passed. This was a harness deadline, not a renderer change.

The discoverable action catalog now tells a director to review the saved result against intent and revise or undo a mismatch through a new preview/apply cycle. Thirteen existing actual HTTP/MCP action tests passed after that guidance-only source change. The broader suite was not rerun because the media/edit implementation did not change; its previous scene-review verification remains in the prior checkpoint.

Canonical originals still contain 78 records and 19 request entries with unchanged digest 7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663. The exercise imported immutable copies into the retained review workspace and created a separate working production. It did not modify the canonical films or launch a paid provider request.

## Useful limits and next product gap

The revised still evidence removes the observed upward-gaze return. It does not certify uninterrupted motion, every finger position, environmental evolution or episode-scale identity. The unused wide is compatible held-state material, not exact simultaneous coverage. An artist should judge the final movement and pacing in playback.

This client does not support audio input. The optional MCP audio block was delivered and browser decoding/sample alignment were checked, but no listening or sound-quality verdict is claimed. The original source audio is included for the artist to review.

Project creation and source imports required the existing app HTTP APIs before the MCP exercise. These are the next missing bridge fundamentals: let a director start and populate a Studio production through a documented contract. The current bridge works with an existing asset-backed production; this exercise does not claim completely autonomous setup, a second external client certification, or an episode-quality gate.

Durable task evidence: outputs/shutter/director-exercise-2026-09-14/. It contains the working MP4, exact MCP requests/responses/manifests and received media, observations, source provenance, saved timeline and verification receipts. Use the case to repeat the method with fresh IDs and current revisions, never replay these mutation requests blindly.
