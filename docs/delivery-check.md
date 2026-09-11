# Delivery Check — inspect the work without rewriting the artist

Experimental local feature, 2026-09-11. Built on Sound Stage commit
`48710df68d519a3938a65acac40d4ddb55e007d0`; entrypoint remains `/media-studio`.
This is a read-only inspection of an existing saved delivery, not a new render,
mastering operation, quality certification or promise of release readiness.

## Artist workflow

Make the cut and explicitly save/render it using Camera & Music / Sound Stage.
Open its Delivery section. **Inspect this saved render** measures that delivery.
Leave the target boxes blank to observe; entering a loudness target or true-peak
ceiling only adds review flags. No signal processing is applied to meet a target.

The panel separates the encoded MP4 audio from the aligned PCM WAV, because the
file being shared and the uncompressed handoff are different artifacts. It shows
integrated loudness, sample peak, estimated reconstructed true peak and, where
measurable, loudness range. A binned momentary-loudness trace is not a waveform.
Missing/below-gate bins are gaps, not invented zeroes or connecting readings.

Review buttons position the **saved delivery viewer**, pause it, and leave the
editable draft alone. They do not autoplay. Near-black, static and very quiet
intervals may be intentional. Static/dark intervals overlapping authored still
clips carry that context. A black title card or photograph is not automatically
removed, regenerated or declared an error.

Every inspection creates a separate historical JSON record. Its saved cut ID,
revision, output asset ID, SHA-256, compiled-plan fingerprint, timestamps, options
and tool versions remain attached. Unsaved changes or a newer saved revision
visibly make that report historical. It never endorses the current draft by
accident. Repeat inspection creates another report; it does not replace old ones.

## What is implemented

- Actual decoded picture count, dimensions, average rational frame rate, square
  pixel aspect ratio and duration compared with the recorded composition.
- Expected audio-stream count, layout and coarse container timing checks. These
  are metadata checks, not perceptual synchronization or every-presentation-time
  validation.
- Separate read-only FFmpeg audio analysis of the encoded deliverable and the
  aligned 48 kHz / 24-bit stereo PCM mix or song derivative.
- Original input checksum checks; output checksum verified before and after
  inspection. PCM is accepted only through the exact cut's whitelisted handoff
  files and matching manifest revision, plan and expected checksum.
- Near-black, static-picture and quiet intervals, EOF closure at actual duration,
  bounded event/curve lists, optional review targets and downloadable report JSON.
- Report status distinguishes technical failure, unavailable evidence, reviewable
  observations and completed checks. “Checks completed” is not platform approval.
- No added npm runtime dependency, external service, uploaded media, paid model
  request, normalization, limiter, retiming, corrective render or original edit.

## Measurement contract

The installed `ffmpeg` and `ffprobe` executables are invoked directly without a
shell. The application accepts a saved cut ID, never a caller-controlled path,
URL or filter graph. Known stream indices come from the inspected media.

Audio uses fixed `ebur128=peak=sample+true:metadata=1`, native channel layout and
`silencedetect=noise=-60dB:d=0.5`. A mono file is not silently compensated as
“dual mono.” The app's current exported mix remains stereo. Integrated loudness
below the gate, digital silence, or files shorter than 400 ms yield a nullable
reading, not 0 LUFS. Loudness range is nullable for material under 3 seconds.
Peak summaries have 0.1 dB precision and true peak is an **estimate**, not an
independently certified meter result. No loudnorm filter is used.

The tested FFmpeg build emitted nonfinite momentary/short-term metadata near the
silent tail of an AAC fixture while integrated loudness and peak summaries were
finite. Such metadata fields are omitted. The curve is marked partial and the
report includes an unassessed check; it does not invent measurements or diagnose
nonfinite source samples. `curve.nonfiniteWindows` counts omitted metadata fields,
not necessarily distinct time windows. All-silent material is explicitly nullable.

Picture uses `blackdetect=d=0.5:pix_th=0.1:pic_th=0.98` and
`freezedetect=n=-60dB:d=1`. These are generic review thresholds, not semantic
understanding of a scene. Picture is not resized for scanning. The detector may
flag intentional stills, darkness and holds. Quiet detection is a fixed -60 dB
threshold lasting at least 0.5 seconds, not a speech or audibility judgment.

Defaults are observe-only:

```json
{"targetLufs":null,"toleranceLu":1,"truePeakCeilingDbtp":null,"scanPicture":true}
```

Custom targets must be finite numbers: -60 to -5 LUFS; tolerance 0.1 to 6 LU;
true-peak ceiling -12 to 0 dBTP. Unknown fields, paths, URLs and string coercions
are rejected. No platform loudness preset or automatic corrective action is
implied by these input ranges.

## API and data custody

`POST /api/media/cuts/:cutId/check` runs explicit inspection and returns a new
`delivery-check` record. `GET` on the same URL lists historical records without
running an analysis. `GET /api/media/checks/:reportId` returns saved JSON with
`Cache-Control: no-store`. State includes historical delivery checks for the
local workspace. No old record kind or composition schema is migrated.

The new route sits behind the existing localhost Host/Origin/Sec-Fetch-Site
checks and serializes with other media work. A disconnected response aborts
pending/running scan work. Each process has a finite 15-minute default timeout;
version probing uses 5 seconds. Output capture is bounded, stderr retains only
a diagnostic tail, metadata lines and record counts are bounded, and filter
strings are fixed. The decoder protocol whitelist permits only file/pipe.
These are practical limits, **not an OS sandbox**, provider isolation or hosted
multi-tenant security. The UI currently waits for completion; there is no live
meter, persistent background job queue or dedicated Cancel button.

Handoff paths reject traversal and symlinks in the controlled render directories.
PCM and manifest bytes are rechecked before report publication. A changed cut
identity or changed inspected artifact aborts publication. A missing original
can be reported as a technical failure while the independently verified exported
file is still measured. A newer timeline save does not change which old render
was inspected.

## Verification actually performed

Environment: Node v22.16.0; FFmpeg/ffprobe 7.1.5-0+deb13u1, Debian build. Test
material is synthetic, generated locally in disposable directories. Production
media and data were not accessed.

**177 scoped Node tests passed**: the retained 136 tests plus 41 new delivery
checks. These cover real SQLite, parent HTTP routes with a test-only loader,
actual FFmpeg decode/render, exact frame/sample contracts, checksum custody,
wrong revisions, metadata validation, deadlines, aborts, malformed media,
missing tools, custom review targets and no automatic correction. The loader
disables unrelated provider/3D modules; this is not the complete original app
suite and no provider generation was exercised.

**Six independent integrated-loudness comparisons passed**, using optional
`pyloudnorm` in Python against the same quantized synthetic samples at 48 kHz and
44.1 kHz, mono/stereo, seeded noise and gated/silent sections. Maximum observed
absolute difference was 0.042401 LU, within the declared 0.12 LU tolerance. The
reference is a separate implementation, not a second call to the same FFmpeg
filter. This does not certify true peak, LRA, every file or the underlying standard.

A separate analytic 12 kHz fixture demonstrates the distinction between sample
and reconstructed peaks in the installed tool. It is not an absolute true-peak
conformance vector. Tested original hashes remain unchanged.

**48 isolated DOM fixture checks passed**: 28 retained Music Cut/Sound Stage
checks and 20 Delivery Check checks. Actual module bodies run with a fake API,
controlled media-element properties and all network requests aborted. Checks
cover options, separate PCM/encoded cards, stale-report scope, saved-viewer-only
seek, report download, missing curve bins, nullable values, unsafe text, bounded
findings and a 390 px viewport. Screenshots show synthetic UI data, not a real
production or playback result.

One ordinary current-turn browser navigation to the actual localhost test server
returned `net::ERR_BLOCKED_BY_ADMINISTRATOR`. No policy/security setting was
changed or bypassed. Real browser playback, seeking, synchronization and media
performance remain unqualified.

Reproduce scoped checks from the complete branch checkout:

```sh
node --test test/delivery-*.test.mjs
python test/verify-delivery-loudness.py
python test/browser/delivery-dom.py
python test/browser/music-dom.py
```

The Python checks require optional installed test packages: NumPy/SciPy/pyloudnorm
or Playwright plus Chromium respectively. They are not product dependencies.
Use `SHUTTER_TEST_CHROMIUM` for a compatible installed browser path. The report
package records the exact retained test filenames and hashes; do not reinterpret
its `177` count as the total number of tests in a future full checkout.

## Reuse and licensing notes

The new Shutter orchestration, UI, reports and tests are original work. Runtime
reuse is through the already installed FFmpeg tools, using documented filters.
No third-party source, executable, model weight, media or font file is bundled
by this increment. `pyloudnorm` is a test-only independent reference, not an
embedded or redistributed meter engine.

Primary documentation consulted 2026-09-11:

- https://ffmpeg.org/ffmpeg-filters.html#ebur128 — scanner and metadata options.
- https://ffmpeg.org/ffmpeg-filters.html#blackdetect — dark-interval semantics.
- https://ffmpeg.org/ffmpeg-filters.html#freezedetect — static-interval detector.
- https://ffmpeg.org/ffmpeg-filters.html#silencedetect — quiet-interval metadata.
- https://ffmpeg.org/ffprobe.html — stream metadata and decoded frame counting.
- https://github.com/csteinmetz1/pyloudnorm — independent MIT-licensed reference.
- https://tech.ebu.ch/publications/r128 — loudness recommendation context.
- https://ffmpeg.org/legal.html — licensing depends on build/components.

An installed GPL-enabled FFmpeg binary was used for these tests and is not
redistributed. A future bundled desktop build needs a concrete dependency/build,
license and codec review; invoking a program is not a blanket commercial legal
clearance. Existing THIRD_PARTY.md obligations remain intact.

## Remaining release gates and next leverage

Use `/media-studio`. The older `public/timeline.js` compatibility guard remains
unpublished and unchanged; this increment does not route asset-backed projects
through legacy Edit. No merge, deployment, DNS change or paid generation is part
of this work.

Still unqualified: real FX30/a6300 recordings, color-managed S-Log/HDR/RAW/ICC,
actual browser playback, native Resolve and FL Studio handoffs, platform
acceptance, perceptual sync, complete app integration and hosted-user isolation.
The checker does not validate every ZIP member, stem, XML/OTIO interchange,
rights clearance or whether a shot is artistically appropriate.

This creates an export-specific evidence layer for later captions/safe-area
checks and deliberate enhancement comparisons. Those extensions are not built
here. Prioritize real-media playback and color qualification before turning
review findings into proposed corrections. Any future fix should create a new
version requiring review, not secretly change the artist's finished master.
