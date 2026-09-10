# Shutter: the boundary between two renders

September 10, 2026. User reported a pause and subtle detail shift between Sol holding the sphere and placing it. This study examined that exact boundary and made reversible editorial comparisons from existing footage. No generation spending, no production-source edits and no changes to the selected master cut.

## Diagnosis

The export has 868 decoded frames with uninterrupted 1/24-second timestamps. There is no inserted pause or timestamp gap. The exporter uses every frame from each selected take, without trimming, overlapping or inventing a transition.

The original ownership clip already has a very quiet ending. Its final second has mean adjacent-frame RGB absolute difference 0.65 on the 0–255 scale. The placement clip starts a new performance and reframe. A difference between the last source frame and the next source frame exists before export: 4.60 mean absolute difference; after export, 4.26. Re-encoding introduces small additional pixel changes, averaging 2.23 versus the source clips, but cannot explain the source hold or make the original generated boundaries identical. Pixel differences are diagnostic measurements, not perceptual-quality or identity scores.

Our earlier five-second tests were written as self-contained beats, with the first ending in a held pose. Assembling all frames preserves that settling time and the next clip's startup. Matching a still supplies pose and appearance guidance, not the preceding motion trajectory. Seeds differ, but this investigation did not isolate the effect of seed. It would be incorrect to diagnose the seam as a seed-only issue or promise that a shared seed solves it.

## Comparisons

All videos have decoded picture and audio and continuous 24fps timestamps. Audio is included but was not listened to. Frame intervals below are zero-based, end-exclusive.

| File | Treatment | Duration | Finding |
|---|---|---:|---|
| original-join.mp4 | Full ownership + placement | 10.3333s | Original source pause and same-angle boundary |
| trim-only.mp4 | Ownership [0,100), placement [6,124) | 9.0833s | Removes 1.25s, but joins less closely matching frames; not a seamless repair |
| short-blend.mp4 | Same trims, 6-frame picture/audio overlap | 8.8333s | Rejected as a preferred fix: visible double edges in inspected blend frames, especially face/glasses |
| coverage-edit.mp4 | Ownership [0,96), existing wider handoff view [92,110), placement [24,124) | 8.9167s | Alternative for viewing: a 0.75s wider-angle insert replaces the same-angle seam with deliberate cuts |

The coverage alternative uses existing full-frame video. No face interpolation, cropping, new objects or newly generated footage. It reuses the already-rendered moment when Sol owns the sphere and Mira is empty-handed; the insert is editorial coverage, not newly observed continuous time. Five-millisecond audio ramps soften the two splice points. This candidate is not automatically accepted into the production. See edit-receipts.json for exact frame selections and decoding results, diagnosis.json for measurements, boundary-frames.jpg and blend-frames.jpg for inspected evidence.

## Method to adopt

For one physically continuous camera take, prefer generating the connected action together within the endpoint's supported duration, rather than artificially dividing every action into five-second blocks. When a take truly must continue across generations, test motion-bearing video context instead of relying only on its last image. MiniMax's own guide distinguishes video continuation from still keyframe anchoring; fal's Max reference endpoint accepts reference video clips. This establishes an available conditioning route, not a demonstrated seamless result in Shutter. A controlled paid test is still needed. [MiniMax reference guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md), [fal Max reference-video API](https://fal.ai/models/minimax/h3-max/reference-to-video/api).

For a normal edited scene, plan overlapping action coverage and cut points: each generation should provide usable lead-in and tail frames, and the edit should choose the action timing instead of automatically preserving every endpoint. Use distinct camera coverage to hide detail re-interpretation when a supposedly invisible same-angle join fails. Sound should eventually have a continuous scene bed and deliberate dialogue/music overlaps rather than restarting all layers at each image cut.

Blending/interpolation must be optional, reviewed tools. A crossfade can soften a discontinuity while producing double images; this example did. Motion estimation can be another experiment, but it cannot be assumed to recover correct hand/face geometry. [FFmpeg transition-filter documentation](https://ffmpeg.org/ffmpeg-filters.html#xfade).

Shutter needs a distinction between **continuing a physical take** and **cutting to another shot**, plus actual in/out timing and coverage selection. The existing Continue from this take flow currently carries image/story state only. It must not imply seamless motion. Resolve this seam requirement before moving on to voice continuity.

Funds unchanged: $4.72154 tracked remaining, including $0.9375 text, $3.58404 image/reference and $0.20 reserve. The original seven-shot 36.1667s master and all takes are intact.
