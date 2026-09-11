# Color Prep — reviewed camera-to-SDR editing copies

Experimental local increment on Delivery Check commit `37a47ec21361135c7401c7a6300603dc0ec19ecc`. Use `/media-studio`. This is a bounded source-preparation workflow, not complete color management or a native grading round trip. Nothing in this increment merges/deploys the application, changes DNS, spends generation credits, or edits production data during verification.

## Artist workflow

Select imported video. Color Prep appears in its source inspector. Deliberately choose the input interpretation and video/limited or data/full levels. File tags are shown as evidence, never as proof of S-Log or another camera profile.

For already finished Rec.709 footage, a LUT is optional. For a log source, import your own compatible conversion LUT, declare its input, and describe the actual camera/export settings. The LUT must produce **display-referred Rec.709 for a gamma-2.4 viewing target**, not scene-linear values. Shutter does not download a Sony LUT or infer S-Log2/S-Log3/S-Gamut from a filename.

Check the review acknowledgment, then preview a decoded frame or the last frame. The before panel is unconverted code values shown with a 709 interpretation; it is **not a valid log viewing transform**. The after panel applies the proposed recipe. These are separate PNG assets. Changing settings invalidates the matching preview; the server also enforces this, rather than relying on a disabled button.

Accepting the recipe produces a new full-resolution **10-bit 4:2:2 ProRes 422 HQ MOV**. Its timeline starts at zero and retains the tested decoded picture count and exact rational cadence. It is a lossy editing copy, not a RAW, archival, or lossless master. The interface then requests a separate H.264 browser viewing copy. A failed optional proxy leaves the prepared editing asset available and explains how to retry only that stage.

The prepared asset becomes the selected source. **No existing shot is automatically replaced and no timeline is saved.** Append it or replace a take explicitly through the existing editor. Returning to an original creates another candidate; a second input conversion on a marked prepared copy is rejected.

The prepared MOV is **picture-only**. Original camera sound stays on the original asset and can be used independently in Sound Stage. Neither camera audio nor a mastered song is normalized or silently remixed by Color Prep. Native camera timecode, reel metadata and source handles are not an interchange promise.

## One preparation, three downstream uses

Prepared proxies use explicit 709 matrix/range conversion and 709 output tags. Extracted reference PNGs use a defined display-referred Rec.709/BT.1886 ideal-black gamma-2.4 to sRGB conversion. Prepared shots use explicit 709 matrix and limited range in the existing rough-cut Fit/Fill renderer. Reference extraction still uses the prepared full-resolution source, not its smaller proxy, and retains the selected decoded frame index.

This does not certify that every browser, operating system, monitor, NLE or generation provider displays these files identically. The existing timeline policy remains `unmanaged-sdr`: an arbitrary mixed cut does **not** become globally color-managed just because one source was prepared. Its current concatenate/copy renderer and mixed-source output metadata need separate qualification. Images, unprepared camera material and unknown generated media do not gain an inferred interpretation.

An imported source's probed color facts remain distinct from authored transformation facts. In the tested FFmpeg ProRes/MOV output, the container reported 709 primaries/transfer/matrix but **omitted a range tag**. Shutter preserves that missing probe field; a separate preparation marker records that the actual conversion authored limited-range pixels. Downstream prepared paths use that explicit marker. It never fills missing probe evidence with invented observations.

## Scope and rejection rules

The current preparation path accepts progressive, constant-frame-rate YUV video with 4:2:0, 4:2:2 or 4:4:4 decoded sampling at supported 8/10/12/16-bit formats. Limits are 600 seconds, 72,000 decoded frames, 1–120 fps, even dimensions up to 4096 per axis and 4096×2160 total pixels, square pixels, and supported right-angle rotation. A candidate prepared output is bounded to 6 GiB. These are implementation limits, not benchmarks or blanket certification at those maxima.

Every decoded timestamp, interlace flag and picture format is inspected. The cadence comparison uses rational arithmetic and one source-clock tick of tolerance for quantization. Variable cadence, missing/nonmonotonic timestamps, dynamic resolution/pixel format, or interlaced pictures fail instead of being silently conformed. Normalization to a zero-based clock does not preserve absolute camera timecode.

PQ, HLG, BT.2020, unsupported YCbCr matrices, RAW/ARW/DNG/HEIC development, ICC-managed photos, ACES/OCIO interchange, HDR tone mapping and automatic camera-profile detection are **not provided**. The photo tools retain their earlier scope. Actual FX30/a6300 recordings still require qualification, including S-Log and gamut settings, data levels, slow/quick-motion and high-frame-rate modes.

The `.cube` importer accepts a deliberately strict 3D-only subset: 2–65 points per axis, red-fastest ordering, unit input domain, unit-bounded finite output, exact row count, bounded lines and 16 MiB total input. It rejects 1D/shaper sections, extended/negative output ranges, includes, executable directives, malformed UTF-8 and ambiguous duplicate headers. A 33-point table exceeding 1 MiB is tested through the raw upload route. This is not universal LUT-format compatibility. Copyright and use rights of an imported LUT remain the user's responsibility.

## Custody, failure and security boundaries

Original and canonical LUT bytes are separately hashed. A content-derived LUT identity also includes the declared input/output meanings. The filesystem and declaration records are checked before use and rechecked before publication. Optional labels are not treated as trustworthy code or paths.

Saved previews bind source identity/hash, canonical settings, LUT hashes, decoded frame and tool versions. Preparation requires that exact preview, verifies both preview assets, checks cadence, and validates the actual output codec, pixel format, frame count, rational frame rate, dimensions, timestamp origin/duration and tags. The derivative records the recipe, tool versions, cadence evidence, original hash and preview identity. SQLite close/reopen preserves the marker and lineage. Identical output bytes may have multiple provenance records; no exclusive source is fabricated for a shared content-addressed asset.

FFmpeg/ffprobe use fixed argument arrays, no shell and restricted decoder protocols. LUT filenames passed to a filter are internally generated hexadecimal names inside a disposable working directory. User paths never enter the process cwd. Paths containing spaces and apostrophes are exercised. Scans have finite deadlines and bounded output capture; conversion requests cancel on response disconnect. Scratch directories are cleaned on success/failure. These controls are **not an OS decoder sandbox, multi-tenant isolation or hosted-service authentication**. No guaranteed atomic filesystem rollback, persistent background queue, progress meter or dedicated Cancel button is claimed.

The existing localhost Host/Origin/Sec-Fetch-Site protections remain. A stale browser operation cannot attach an old preview to a newly selected source. Metadata, LUT labels and asset identities are escaped in the inspector. An optional viewing-copy failure is reported as partial completion, not a reason to duplicate preparation.

## Verification performed

**227 scoped Node tests passed: 177 retained plus 50 new.** New coverage includes LUT parsing/custody, settings review, exact saved-preview matching, original preservation, real FFmpeg preview/ProRes/proxy/reference/rough-cut paths, VFR and PQ rejection, cancellation, SQLite reopen, and ten actual-parent-HTTP checks. The synthetic main camera-like fixture is 192×108, 10-bit 4:2:2, 24 pictures at 24000/1001; it is not a Sony recording.

Four independent numeric comparisons use manually generated 10-bit YUV planes, a separately written YCbCr matrix/range calculation, independent tetrahedral interpolation for a nonseparable LUT, and a display-referred gamma-2.4 to sRGB calculation. Limited/full range, identity/LUT, eight patches and three channels give 96 compared channel values. The maximum observed difference was **1.414 of 255 code levels**, below the predeclared 3-level tolerance. Patch centers exclude chroma-resampling boundaries. This is not a perceptual, LUT-brand, display, standards-conformance or full-gamut certification.

An early oracle used inverse camera OETF instead of display EOTF and failed. Checking zimg's implementation clarified the reference-viewing policy; the oracle and documented interpretation were corrected without widening the error tolerance. The implementation also needed explicit planar floating-point RGB negotiation before packed reference output. These are recorded to avoid treating a passing self-comparison as independent evidence.

**66 isolated DOM checks passed: 48 retained plus 18 new.** They execute actual module bodies with fake API responses in an empty Chromium document and abort network requests. They cover explicit choices, log-LUT filtering, matching/stale previews, prepare/proxy sequencing, late-response source changes, retaining a prepared asset after proxy failure, HTML escaping, original navigation, and mobile width. Screenshots embed genuine locally rendered synthetic test-pattern PNGs with their actual recorded recipe; the surrounding app state remains a fixture.

An ordinary localhost browser navigation in this turn returned **`ERR_BLOCKED_BY_ADMINISTRATOR`**. No policy was altered or bypassed. Real browser playback, seeking, perceptual synchronization and display appearance remain unqualified. The complete pre-existing application suite, production database, actual Sony files, native Resolve/FL Studio applications, final commercial packaging and hosted security were not tested.

Local work reconstructed the media subsystem from the previously attached implementation packages, not the complete repository. All seven modified existing files were checked against their exact parent GitHub blob SHAs before publication. The parent full source tree remains the base of the proposed Git tree; unrelated files are preserved. The earlier legacy Edit compatibility guard is still intentionally unchanged: open these productions with `/media-studio`.

## Reproduce in a complete checkout

Use Node 22 with built-in SQLite plus an installed FFmpeg/ffprobe build containing zscale, lut3d, prores_ks, PNG and libx264. No new npm runtime dependency is introduced.

```sh
node --test --test-concurrency=2 test/color-*.test.mjs
node --test --test-concurrency=2 test/*.test.mjs
# The second command includes more original tests in a complete checkout than
# the scoped reconstruction used here. A full-checkout result is not claimed.
node test/helpers/color-demo.mjs
python test/browser/music-dom.py
python test/browser/delivery-dom.py
python test/browser/color-dom.py
python test/browser/live-navigation-check.py
```

The browser checks optionally require Python Playwright and Chromium. `SHUTTER_TEST_CHROMIUM` selects a normal installed executable. The navigation check records failure as evidence, not success. The HTTP harness disables only unrelated provider/3D imports using the documented test loader. It never authorizes a paid provider operation.

## Primary references and next gate

FFmpeg's official filter manual documents `zscale` input/output range, matrix, primaries and transfer controls and `lut3d` tetrahedral interpolation: https://ffmpeg.org/ffmpeg-filters.html#zscale and https://ffmpeg.org/ffmpeg-filters.html#lut3d . zimg's `src/zimg/colorspace/gamma.cpp`, retrieved September 11, 2026, Git blob `b73626197fcc524bc5fef9df848f5cca5841ab3e`, distinguishes scene-referred 709 OETF from display-referred BT.1886 EOTF: https://github.com/sekrit-twc/zimg/blob/master/src/zimg/colorspace/gamma.cpp . No third-party implementation code or LUT was copied into Shutter.

No FFmpeg executable, commercial LUT, model weight or font is bundled. Shipping a desktop binary still requires review of the exact dependency/build and codec terms: https://ffmpeg.org/legal.html .

The next release gate is a real-camera/display qualification pack and an ordinary-browser end-to-end run: known input settings, prepared reference/proxy/export agreement, original camera sound alignment, slow/high-frame-rate handling, and independently opened Resolve handoff. Titles/captions should build on that tested picture/sound loop, not conceal unqualified media behavior.
