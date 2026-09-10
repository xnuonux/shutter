# Shutter: ownership across a scene cut

September 9, 2026, America/Chicago. Completed late evening; receipts use September 10 UTC.

The six-shot review cut is **31 seconds**, 832 × 480 at 24 fps, with stereo 48 kHz audio. Four existing shots were reused, followed by a physical sphere handoff and an independently rendered close-up of its new owner. Previous editions remain preserved.

## Observed result

Fourteen sampled frames per new shot show Mira extending one amber sphere, Sol supporting it before her release, and Mira withdrawing empty hands. Native-size contact and release frames were also inspected. A new over-Mira's-shoulder shot starts with Sol already holding that sphere and keeps it with him while he looks up at her. Mira's wet orange clothing and Sol's dry indigo clothing remain legible. No duplicated sphere was visible in the inspected samples.

This supports the specific cross-render ownership transition. It does not establish arbitrary episode continuity. Fine finger anatomy during occlusion, exact sphere dimensions, precise room geometry and all-frame facial identity remain unqualified. The close-up has some framing movement despite the locked-camera prompt. Audio fully decodes and contains signal in all six segments; artistic sound quality has not been listened to or approved. These takes are selected for review, with no blanket acceptance applied.

## Reusable method

1. Record the entering and leaving state explicitly: owner, prop count, clothing, wetness and location.
2. For a continuous action, use the previous take's actual final frame as the opening and compose the intended ending state before paying for animation.
3. Animate that transition with H3 Max I2V opening/end images. Review the shared grip and release, not just the endpoints.
4. Compose the next camera setup from the established ending state and original character identity. This was a newly generated angle, not a crop or extension of the first video.
5. Generate the next shot independently, then inspect the actual cut boundary and continued prop ownership.

The new close-up still was prepared from the planned ending while the handoff rendered. Its paid animation was submitted only after the returned handoff matched the needed ownership state. This matters: a planned state is not automatically an observed state.

Images used built-in image_gen, with no fal image-generation charge. Exact prompts are in image-prompts.json and closeup-prompt.txt. Underlying built-in image model variant was not exposed. Project assets are also stored in Shutter's immutable asset store.

## Spending and receipts

| Render | Endpoint | Billed seconds | Actual USD |
|---|---|---:|---:|
| A burden shared | minimax/h3-max/image-to-video, 480P, start/end | 5 | 0.0625 |
| What he carries now | minimax/h3-max/image-to-video, 480P, opening | 5 | 0.0625 |
| This milestone | | 10 | **0.125** |

Both returned 124 frames, 5.1667 seconds, with five billable units. Live price checks passed before each submission. No retries or other paid model calls.

Cumulative Max spending from the user-reported $6.20 is $1.41596. Remaining task budget is **$4.78404**: text $0.9375, image/reference $3.64654, reserve $0.20. This is the application ledger, not a fresh provider account-balance query. Historical regular-H3 spending was already outside this starting balance. Future commercial funding remains unavailable.

Handoff job job_3b41d0cb-5955-4058-9850-7f27a7d56907; provider 01a0897d-0263-7bf2-ac2b-740ddd00f04c. Ownership job job_ada71234-4cf0-43bd-8a7b-a2776bf36512; provider 01a08980-9037-70f3-b56e-1de930212141. Both ready; never resubmit.

Production prod_ba9072b5-21f0-4973-b413-05678795ef46 revision 12. Cut cut_af619d6ea01f70e8862012875ace3a053804998609686de9ee3575707f8ea480; output asset_6dbd65af45f458b1d997846c397dec7ba9778c674515348e6abcd137ffe122a1. Export, budget, individual job receipts and full media verification are saved alongside this report.

## Next useful product step

Turn the proven manual sequence into one guided shot-planning flow: carry forward a selected take's actual ending, explicitly edit the next story state, compose the new camera setup, and inspect only the affected cut after a revision. Preserve Moment mode. First expose the already available opening/end-image and state controls coherently; avoid building automatic scoring or a large new orchestration layer. Dialogue, voice continuity and a longer sequence remain separate untested capabilities.
