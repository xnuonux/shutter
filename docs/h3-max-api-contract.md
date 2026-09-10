# H3 Max API contract for Shutter

Checked September 9, 2026 against the live OpenAPI schemas. These are configuration facts, not completed generation tests. The exact provider schemas are preserved alongside this note.

## Common inputs for text, image and reference routes

| Field | Contract |
| --- | --- |
| prompt | Required string, 1–50,000 characters |
| prompt_expansion_mode | Required string despite a documented balanced default; examples balanced/quality. Use explicit balanced; do not invent a disabling value |
| duration | Integer 5–15, default 5 |
| resolution | 480P, 768P, 1080P; default 768P. Current funded scope only 480P/768P |
| seed | Optional integer or null |
| enable_safety_checker | Boolean, default true; retain true |
| sync_mode | Boolean, default false; true requests base64 rather than a CDN URL |

T2V adds aspect_ratio: 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, default 16:9.

I2V adds optional image_url and end_image_url. With an opening image, canvas follows it. With only an ending image, canvas follows the ending image. With neither, it falls back to T2V at 16:9. Shutter should require an actual image when the person selected image-to-video, so a missing asset cannot silently change the operation. There is no separate I2V aspect_ratio field.

Ref2V adds aspect_ratio, with adaptive plus the six T2V values, default adaptive. reference_image_urls allows up to 9; reference_video_urls up to 3; reference_audio_urls up to 3. Their combined total must not exceed 12. Every audio/video clip is 2–15 seconds, and the combined duration in each of those modalities is at most 15 seconds. Audio needs at least one image or video. Bind prompt names by list order: Image 1, Video 1, Audio 1. Enforce described cross-field limits even when the JSON schema only encodes individual array limits.

All three expose a video result, optional expanded_prompt and optional timings. Ref2V's result also declares seed. Preserve the returned fields rather than assuming every endpoint echoes the input seed. timings.inference measures backend denoising, not the user's total wait. Decode the returned media; the generic documentation example's image/png value is not evidence that video output is an image.

## Multi Angle candidate

Endpoint minimax/h3-max/multi-angle/image-to-video uses the common duration/seed/safety/sync/expansion fields, but defaults to 480P. image_url is required. prompt is optional and defaults to a frozen scene with camera-only motion.

camera_trajectory is optional; when supplied it contains 2–12 ordered keyframes. Each has required time (normalized 0–1, not seconds), azimuth (degrees), elevation (−90 to +90 degrees) and distance (strictly positive normalized scene units). The first/final poses hold outside their times. Signed full turns are preserved; total azimuth travel is limited to 32 turns. Duration does not change the normalized time domain.

This route is a research candidate, not a submitted job or an added budget item. Test modest angles first; missing geometry remains inferred. The current schema describes an internal camera LoRA, not a user-uploaded LoRA control.

## Integration boundary

Use a named route and its exact schema. Do not send Wan workflow fields, copy other models' reference syntax, or label generic reference conditioning as guaranteed localized editing. Save input asset digests, current-state versions, original/expanded prompts, provider request ID, estimated/actual charge, chosen take and review outcome. A seed is not a portable character identity.

The existing regular-H3 budget helper is incompatible with Max reference-token costing. Shutter now uses src/fal-renderer.mjs with pre-submit reservations, decoded reference token accounting, current-price verification and actual receipt reconciliation. current-video-budget.json is a checkpoint of that persisted app ledger. Three actual app calls qualified T2V, I2V and single-image Ref2V for $0.375. Each returned 124 frames at 24 fps for a five-second request; actual picture duration is retained rather than relabelled. Mixed video/audio reference requests remain live-unqualified. See runpod-and-h3-milestone.md.

Sources: [T2V schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3-max/text-to-video), [I2V schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3-max/image-to-video), [Ref2V schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3-max/reference-to-video), [Multi Angle schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3-max/multi-angle/image-to-video).
