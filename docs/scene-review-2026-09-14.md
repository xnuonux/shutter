# Saved scene review

September 14, 2026. Implemented in source commit **2f69cf9**, integrated locally into C:/dev/shutter.

A director can now inspect the composed result of an edit. Previously the bridge supplied source motion and proposed cut-boundary images; the new operation produces a bounded section of the saved scene with its visible camera coverage, burned titles/captions and authored sound. The artist uses the same service under Review scene below Program.

## Contract

MCP: shutter_review_scene. Required inputs: projectId, baseRevision, startFrame and endFrame. Times are integer output frames on the saved production clock, end exclusive. Request at least 2 frames and at most 30 seconds. Optional frameCount is 2-12, default 8. includeImages defaults true. includeAudio defaults false and explicitly supplies a verified MP3 audio block when the scene has authored sound. No sound produces no audio block.

POST /api/media/productions/{projectId}/review accepts the revision, frame bounds and optional frameCount. The response uses schema shutter-scene-review-v1 and a deterministic scene_review_ identity. It carries project/revision/plan hash, selected picture source intervals, saved scene intent, frame positions, sampling gaps, file hashes and preview properties. GET/HEAD media routes are scoped to the production and review ID under /reviews/{id}/preview, /audio, /wave and /frames/{index}. Video and audio use existing 206/416 byte-range handling.

The operation renders only the selected interval, with at most 64 visible picture segments. It uses the existing saved-edit compiler and mediaPictureFilters. Slices retain each source clock's origin and frame offset. The compositor receives the original plan and requested scene offset, preserving full-size text layout and frame-exact cues. Picture processing keeps the source scene frame rate, then reduces playback to at most 1280 pixels on its long edge. Ordered JPEGs use at most 640 pixels and include the first and last playback frames.

Sound Stage now exposes renderSoundStageInterval. It decodes the intersecting source samples and evaluates fades against the original clip position. Gain, mute/solo, explicit source streams and master padding retain existing semantics. Global start/end sample boundaries are rounded separately at 48 kHz, including rates for which one frame does not contain an integer number of samples. The mix is retained as exact PCM WAV and encoded into playback and optional MCP MP3. Full timeline export still calls the original full-range entry point.

Cache output lives under scene-reviews, separate from imported assets and deliveries. Each request rechecks source bytes and saved plan/intent before returning a cached or newly rendered result. Context changes and cancellation reject publication; partial render folders are removed with checked local paths. Intermediate picture/audio work is removed after success. A historical cache file remains tied to its original saved revision. This operation writes only its review record and files, with no edit, note, asset, cut or generation request.

## Verification

The full suite passed **532 of 534 tests**, with zero failures and two existing Windows symlink skips. New coverage comprises four real HTTP/MCP/FFmpeg scene tests, one hostile MCP transport test and one sound interval regression. The fixture compares video against the corresponding full-export frames and checks title presence at exact boundaries. Its WAV is sample-identical to the full mix slice. Separate coverage verifies fractional clock rounding, master-only audio, silence, stills, downscaling, invalid requests, scoped byte ranges, source/cache corruption, changed context and active cancellation.

Fifteen actual Chromium checks pass for local rain footage, saved [24,84) review playback, decoded audio, sample seeking, late-response/range/draft/project invalidation, readable labels, mobile width and no paid requests. The fixture is prod_16d54af0-8619-4b89-8542-c704aede5bcd on review port 4688. Three read-only canonical browser checks pass. Independent source review found no concrete correctness issue.

Original canonical records remain 78 with 19 request entries, unchanged SHA-256 7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663. No paid calls, $0 spent. Source and integration are local; no remote publication or external director configuration occurred.

Task evidence is preserved in outputs/shutter/scene-review-2026-09-14/: full/targeted/transport test logs, browser receipts and desktop/mobile screenshots, read-only review and original-data preservation evidence. The canonical current checkpoint identifies the active processes and next milestone.

## Practical limits

This is unmanaged SDR review, not calibrated delivery or semantic continuity approval. Sidecar-only captions stay separate by their existing delivery policy. JPEG samples leave gaps; a URL is not native-video perception. Explicit MP3 blocks are usable only by clients that support audio, and compressed playback can contain codec padding. The WAV is the exact authored sample interval. No complete external AI director session or episode is certified by these mechanical tests.
