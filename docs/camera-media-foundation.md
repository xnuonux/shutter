# Shutter: Camera & Music foundation

Status: implemented experimental branch, not a finished editor or commercial release.
Baseline: `xnuonux/shutter`, commit `7fe2864c3f8e4a460e30ec52aa80e8de439b0f04`.
This work adds a functioning local, asset-backed rough-cut path to the existing studio.
It does not replace Direct / Canvas or silently migrate existing main/coverage timelines.

## The intended production

Make a song in FL Studio, export its mastered WAV, import camera footage and photos,
make a first cut, extract a selected first/last camera frame for generation, import
an accepted generated shot, and deliver the same saved revision to another editor.

A camera original, a photo original, a mastered WAV and a generated result are all
ordinary immutable assets. Generation jobs describe provenance, not permission to
appear on a timeline. A viewing proxy and a photo adjustment are separate derived
assets with their original's hash and an explicit recipe.

## Open and use it

Use the existing repository installation and Node runtime supporting `node:sqlite`
(tested with Node 22.16.0). Install local FFmpeg/ffprobe with the required decoders,
libx264, PNG, AAC and PCM encoders. This change does not download or redistribute
FFmpeg. `SHUTTER_FFMPEG` and `SHUTTER_FFPROBE` can select local executable paths.
Run the normal `node src/server.mjs` entry point and open
`http://127.0.0.1:4677/media-studio`. The original home page links to the new workspace.

Create a Camera & Music production, import files, select a source and append it.
Select the WAV and choose Use as master. Set output frame rate and dimensions,
source start, output frame count and Fit/Fill for each shot. Save, acknowledge the
unmanaged-color restriction, and render. A finished render includes its own MP4,
XML, OTIO, conformed shot media, aligned PCM WAV and a manifest. The ZIP keeps the
handoff media together; extract it before importing/relinking in the target editor.

The selected song starts at timeline zero. This first mode intentionally excludes
camera audio. Longer soundtracks trim to picture; shorter soundtracks pad with
silence. Original audio files are not normalized, mastered again, overwritten or
converted on import. The exported PCM track is a separate 48 kHz/24-bit/stereo
alignment derivative; non-48 kHz inputs are resampled for that derivative only.

The source viewer can make a 720p-bounded H.264 viewing copy of difficult SDR
video. Selecting that original still appends/extracts from the original; the proxy
only changes the viewer source. A proxy is not an exact frame-index reference.
HDR viewing proxies and non-square-pixel conform require a later explicit path.

First/last-frame extraction uses the original decoded stream. Last means count the
actual decoded pictures and extract index `count - 1`, not duration minus epsilon.
The returned PNG is immediately a normal shared asset. Direct's existing H3 adapter
can use shared images and reference clips. This release adds no Kling adapter,
provider submission, generation spending, automatic model choice, or camera-to-AI
transition approval. A still frame cannot guarantee motion/lighting/identity
continuity; accepted generated results must be reviewed and cut deliberately.

The photo controls produce adjusted PNG copies with brightness, contrast,
saturation and rotation. The backend additionally accepts bounded pixel crops.
This is the first photo-adjustment engine, NOT a Photoshop/RAW/PSD clone.

## What is actually implemented

- Streamed import with backpressure, SHA-256 content addressing, duplicate detection,
  a finite configured ceiling and temporary-file cleanup on rejection/abort.
- FFprobe-backed codec, dimensions, pixel format, fractional rate, timestamps,
  color tags, rotation, sample aspect ratio and audio sample metadata.
- Immutable originals and stored lineage for adjusted images, extracted frames and
  viewing proxies. Production exports include transitive original dependencies.
- A versioned `shutter-media-edit-v1` document in the EXISTING `timeline` record,
  with revision conflicts, undo/redo and a compiler dispatch preserving the original
  main/coverage compiler. No fake ready job is needed for imported footage.
- Video/photo assembly at an explicit output rate and canvas size. Fit letterboxes;
  Fill crops. Upsizing is conventional scaling, not invented AI detail.
- Independent mastered audio, decoded-frame references and local image adjustments.
- Source-referenced manifest, FCP7 XML candidate, OTIO candidate, conformed media
  and a one-click ZIP32 handoff when the package fits below 4 GiB. Larger handoffs
  retain individual files and explicitly report `zip64_required-use-individual-files`.
- The parent HTTP server's existing localhost/Origin/Sec-Fetch-Site protections stay
  ahead of every new route. New code does not expose a public hosted application.

## Evidence and limits

54 Node checks passed in the supplied verification run. These include the prior 16
compiler contract tests (one compares 100 seeded fixtures with an independent
per-frame oracle), media/SQLite tests and HTTP tests against the actual parent
server with unrelated provider/3D modules disabled by a TEST-ONLY loader.

Actual FFmpeg experiments exercised synthetic H.264 10-bit 4:2:2 at 30000/1001,
8-bit lower-resolution video, PNG stills, stereo PCM24 at 48 kHz, PCM24 at 44.1 kHz,
a streamed 36 MiB WAV, and a synthetic 3840x2160 10-bit 4:2:2 source rendered to an
exact six-frame 1920x1080 cut. These are not files recorded on a real Sony camera.

The mixed-source fixture produced 60 frames at 24000/1001. Its aligned WAV had
120120 stereo sample frames at 48 kHz. An independent RIFF parser confirmed that
the original 48 kHz/24-bit PCM prefix was bit-identical and the padding was zero.
An independent Python ZIP reader verified CRCs, file SHA-256 values and XML parse.
This does not establish bit identity for arbitrary audio encodings or resampling.

Browser navigation was blocked by this environment's administrator policy
(`ERR_BLOCKED_BY_ADMINISTRATOR`). No browser policy was changed. JavaScript syntax
was checked, but browser end-to-end operation and native Resolve/FL Studio imports
are NOT certified. The old complete application test suite was NOT rerun; this is
not a claim that its reported 41 tests or the user's production data were exercised.

## Compatibility is measured, not promised

Import detection includes MP4/MOV-family, MKV/WebM-family, MTS/TS, WAV/RF64, AIFF,
FLAC, MP3, PNG, JPEG, WebP and TIFF when the installed FFmpeg build can decode them.
Only the fixtures described above are certified by this run. Codec, bit depth,
chroma, frame timing, color encoding, sample aspect, browser support and platform
all matter; an extension is not a support guarantee.

RAW/ARW/DNG and HEIC/HEIF named inputs are explicitly rejected in this release.
A future photo engine needs genuine RAW development, ICC/working-space support,
orientation qualification, high-bit-depth operations and edit recipes. Do not
substitute an embedded thumbnail and call it a developed RAW photo.

Known PQ/HLG/BT.2020 video is refused by the SDR assembly renderer. Untagged S-Log
cannot be reliably identified from ordinary tags and is NOT auto-graded. Unknown
color receives an explicit review warning. The current display-referred photo
path is not ICC/ACES/OCIO color management. Non-square-pixel conform is refused.

Mixed source rates use an EXPLICIT wall-clock nearest-frame conversion, which may
drop or duplicate pictures. Source cadence remains `unassessed`; this is not a VFR
classification or an optical-flow interpolation claim. Audio is sample-accounted
independently. Different image resolutions alone do not require neural upscaling.

Resolve handoff currently means CONFORMED H.264 rough-cut media with baked framing,
not original-camera grading handles, native `.drp`, Fusion effects, grading nodes,
AAF/OMF or a lossless round trip. OTIO output is structurally generated but not
validated with the native OTIO library here. FL Studio handoff means ordinary
aligned WAV audio, not a reconstructed `.flp` or plugin/routing state. PSD layers
are not preserved. None of these native projects are mislabeled as supported.

## Operational boundary

This remains a local, single-user experimental mode. 8 GiB is an implementation
ceiling, NOT an 8 GiB stress certification. One media operation per store root is
allowed in-process; there is no durable queue or cross-process worker lock. A
restart during work can leave an orphan intermediate directory, not a finished
cut. Filesystem and SQLite updates are not a distributed transaction. Disk quotas,
resumable import, cancellation, crash recovery and garbage collection are still due.

FFmpeg runs with bounded diagnostics, deadlines, no shell and a restricted input
protocol list, but NOT an operating-system decoder sandbox. Parser updates,
resource isolation, authenticated account boundaries and job workers are required
before any public service. Existing localhost Host/Origin checks are not accounts.
There was no deployment, DNS change, paid generation or modification of local user
production data during this work. Provider and renderer dependencies were not bundled.

## Next engineering acceptance gates

1. Qualify real FX30/a6300 files: representative codecs, recording rates, profiles,
   rotation, long clips and relevant sidecars. Preserve metadata and originals.
2. Color-managed input interpretation and nondestructive photo development; explicit
   log-to-working/output transforms shared between preview, references and delivery.
3. Complete asset-backed composition inside the main Edit experience: audio lanes,
   still duration, transitions, waveform/beat markers, preview caching and placement.
4. Open the handoff fixtures in specific Resolve/FL Studio versions. Record actual
   import results, then add original-media relink, handles, stems and return versions.
5. Camera-to-generation command proposals: reference range, first/last frame, provider
   capability validation, quoted cost, explicit submission, comparison and acceptance.
6. Optional temporal video enhancement on selected shots, with estimates and A/B
   review. Never rewrite originals, reinterpret resized footage as recovered detail,
   or conflate frame interpolation with spatial upscaling.
7. Durable workers, resume/cancel, disk quotas, package recovery and commercial auth.

The useful Cinema carry-over is source/take lineage. The inspected
`lunari-scheduler/app/engines/cinema-take-assembly.js` preserves provenance, but also
uses a default duration and a decimal frame-rate fallback. This implementation
keeps lineage and uses probed source facts plus exact rate strings instead; it does
not transplant the scheduler's state authority or its cloud stack.

## Primary references consulted

- Sony FX30 specifications: https://www.sony.com/electronics/support/camcorders-and-video-cameras-interchangeable-lens-camcorders/ilme-fx30/specifications
- Image-Line audio export: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/fformats_save_export.htm
- FFmpeg filters: https://ffmpeg.org/ffmpeg-filters.html
- FFprobe: https://ffmpeg.org/ffprobe.html
- OpenTimelineIO: https://opentimelineio.readthedocs.io/en/latest/
- Resolve editorial tools: https://www.blackmagicdesign.com/products/davinciresolve/edit
- Existing Shutter H3 contract: `src/h3-spec.mjs` at the baseline commit.

Run the new and retained contract checks with:

```sh
node --test test/media-foundation.test.mjs test/media-http.test.mjs test/timeline-contract-review.test.mjs
```

Use a separate `SHUTTER_DATA` test directory and back up production data before
trying this experimental branch. The full repository is still required; the
standalone change package is an overlay, not a replacement for the application.

## Publication exception / merge blocker

The GitHub connector blocked the write of the small compatibility guard in
`public/timeline.js` twice, reporting that it could not determine the request's
safety status. That file remains at the baseline on the published draft branch.
The complete downloadable overlay contains the local guard. Until it is reviewed
and incorporated, open Camera & Music edits through `/media-studio`; opening them
in the legacy Edit view can fail. Do not merge this draft as a completed migration.
All other published source/test files are checked against the locally tested bytes.
