# Shutter: H3 Max is now inside the production room

September 9, 2026, America/Chicago. Local implementation and three live provider checks, not a commercial release or episode-continuity certification.

## RunPod decision

RunPod is a plausible later throughput experiment, but it is not a saving established by an hourly GPU price. The current official list includes RTX 6000 Ada 48 GB at $0.84/hour, L40S 48 GB at $1.09/hour and A100 80 GB at $1.59/hour. Availability, storage, setup and idle time affect the bill. The existing fal balance does not fund a RunPod rental. [RunPod pricing](https://www.runpod.io/pricing).

At $1/hour, matching fal's promotional 768p text/image rate of $0.02 per generated second requires at least 50 usable output seconds per hour, or ten five-second clips, before setup and storage. That means under six minutes per usable clip. At 480p's $0.0125 rate, it requires 80 usable seconds per hour, under 3 minutes 45 seconds per five-second clip. At reference-to-video's $0.05 base rate, the comparable threshold is 20 usable seconds per hour, before reference overage. These are arithmetic break-even thresholds, not measured H3 performance.

There are two substantive differences to resolve first. Public H3's posted license excludes the US, EU, UK and South Korea absent a separate grant. A US self-hosting experiment needs that resolved. fal describes H3 Max as its own post-trained version of H3; no matching downloadable Max release was verified in this research. Renting a GPU cannot be assumed to reproduce Max. [H3 license](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE), [fal's H3 Max introduction](https://fal.ai/learn/devs/introducing-h3-max-by-fal).

The current community low-memory experiment demonstrates a promising quantization/offload route, but its reported reduced-memory tests use a Blackwell GPU and Linux, including a simulated VRAM cap. It is not a throughput qualification for Dom's Windows GPU or a chosen RunPod instance. [Primary experiment](https://github.com/Tomiigo/minimax-h3-16gb).

Decision: use the already funded fal trial now. No RunPod machine was rented, no separate account was charged and no H3 weights were downloaded.

## What now works in Shutter

- The shot editor has H3 Max text-to-video, image-to-video and reference-to-video, with 480p/768p, duration, sound description and the correct input fields for each route.
- A shot can bind original character identity, current appearance, its own location, opening/ending images and explicitly labelled image/video/audio references. A named new location does not silently inherit an old set's image.
- Preparing a take freezes its source assets and revision, decodes references and estimates their pooled token cost. Rendering rechecks the current provider rate and reserves the correct budget pool before making one paid request.
- Provider request IDs, the exact prompt/reference bindings, returned expanded prompt, charges and actual decoded media stay with the take. Unknown submissions retain their reservation and do not automatically retry.
- The first real results had 124 frames at 24 fps rather than the planned 120. Shutter now preserves and displays the measured 5.1667-second picture duration. The files also contain audio; the browser reports a slightly longer container duration of 5.184 seconds.
- Existing Moment drafts, cast, local-rendering history and Blender stage remain available. The existing MCP bridge uses the same production API.

## Three live calls

All were requested at five seconds and 480p, one at a time through the running app.

| Route | Shot | Actual picture | Actual charge | Provider request |
| --- | --- | --- | ---: | --- |
| Text | The ridge beacon | 832 × 480, 124 frames | $0.0625 | 01a088a7-15bb-75a2-8aac-dc91796e3ee5 |
| Image | A quiet signal | 704 × 480, 124 frames | $0.0625 | 01a088a9-808c-7d92-af37-9b74bc4a838a |
| Reference | Mira at the ridge | 832 × 480, 124 frames | $0.2500 | 01a088ac-c224-7bb0-b15a-f947378f22c6 |

Each charge comes from returned billable units and the checked provider price. Total new spending is **$0.375**. Remaining against the user's reported $6.20 starting balance is **$5.825**, composed of **$0.9375 text**, **$4.6875 image/reference**, and **$0.20 reserve**. This is a reconciled task ledger, not a live account-balance query. The earlier regular-H3 $2.40 was already outside the new balance and was not subtracted again. There are no active paid jobs or unresolved charges at this checkpoint.

## Visual observations and next discriminating test

Unaltered start, middle and end frames were inspected for each result and compared with the source images. The beacon grows brighter and returns toward its initial glow in those samples. The observatory retains both characters and the broad set. The independent ridge shot retains recognizable Mira, curly hair, orange jacket, dark scarf and one amber sphere, while changing the location. The ridge shot also reaches the requested horizon-facing ending pose in the samples.

This is not proof of exact identity or all-frame continuity. A concrete cross-scene discrepancy is sleeve state: the observatory has rolled sleeves, while the ridge has longer sleeves. The reference close-up also differs in framing and visible costume detail from the master. The model's expanded prompt says "fully_preserved"; that is generated provider text, not an independent assessment. Earring/scar precision, hand geometry and exact orb scale are not certified at this resolution.

Next useful funded comparison: bind the same canonical identity plus an approved current-look image with explicit rolled sleeves, scarf and prop possession, then render another ridge angle and a return to the observatory. Change one continuity variable at a time. Carry accepted story state forward; never automatically promote a visually attractive take to canon. No automatic rerolls or additional paid batch were launched after these three.

## Remaining product work

The route integration is real. Universal long-form production is still unqualified. Current-look inputs and pooled motion/audio billing have automated checks, but the paid live trial used a single image reference, not a mixed image/video/audio request. Voice and lip sync were not listened to or approved. The current review-cut exporter joins matching silent videos and does not yet assemble these mixed-canvas, audio-bearing H3 takes. Individual clips play and download successfully.

The most useful next capabilities from the saved Higgsfield/workflow research are explicit story-state progression, stable set/camera references, selected-take assembly with sound, and bounded local edits that preserve accepted footage. Blender stage assets and camera passes exist; full interactive camera-to-H3 control and guaranteed object-only edits are not implemented. See the separately saved September research for dated sources and candidate methods. No new third-party code was adopted in this milestone.

Verification: all 23 Node tests passed, including production HTTP and MCP behavior, immutable source/revision checks, duplicate prevention, budget rejection and media validation. Browser syntax and whitespace checks passed. The browser showed the new controls, actual timing, connected provider and playable ridge take (readyState 4, no media error). All three saved outputs decoded completely. No release, GitHub publication or external deployment occurred.

Original Lunari task and media are preserved. The separate future $10 eternities.ai commercial and user-supplied music preference remain in future-eternities-commercial-brief.md; that funding has not been spent or assumed available.
