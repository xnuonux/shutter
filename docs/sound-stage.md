# Sound Stage — independent sound around a finished song

Experimental increment on Music Cut commit `4fa95bf89920ed7819e9231ac2aaf7ef8fe36a9f`.
Use `/media-studio` with a separate test data directory. This is a local editing
feature, not a hosted service, a complete DAW, or a certified professional handoff.

## Creative intent

A finished song should be the foundation of an edit, not a constraint that excludes
all other sound. Sound Stage adds explicit dialogue, voice, ambience, effects and
music lanes around that song. An artist can keep the mix exported from FL Studio,
place a camera sound or recorded line at a chosen moment, shape a fade, audition a
lane, and deliver a mix plus aligned stems without altering any source file.

The primary design decision is to make the authoring state and the heard result
agree. This first increment builds a listening mix from a saved revision rather
than attempting unqualified real-time multi-source browser mixing. When sound
changes, the old listening mix stops being eligible. The program monitor never
silently substitutes the untouched song for an unbuilt Sound Stage mix.

## Using the workspace

Open an asset-backed production in Camera & Music. Import footage and your finished
song through Material, then assemble picture using the existing Music Cut tools.
The song is still the fixed timeline-zero master. Under the picture workspace,
choose **Open sound lanes**. This is an explicit policy opt-in; older edits keep
their existing soundtrack-or-silence behavior until enabled.

Choose a lane role, add the lane, select audio or camera footage in Material, and
choose an eligible audio stream. Move the picture playhead, then choose **Add
selected at playhead**. A new clip initially uses up to five seconds from the
selected audio stream. The inspector exposes placement, source-in, duration,
fade-in, fade-out and clip gain. Time fields accept decimal seconds or fractions;
the exact stored 48 kHz sample-frame positions remain visible.

Lane gain, mute and solo are explicit. The original song has mute and solo controls,
not an automatic re-mastering chain. Output gain is an explicit attenuation of the
whole mix. Changes join the existing undo/redo and revision-bound draft-recovery
path. Picture edits do not ripple audio placements; shortening picture retains
out-of-picture audio authoring data and warns that export truncates it.

**Save & build listening mix** saves a dirty draft and renders audio for that saved
revision. It does not generate video or contact an inference provider. It publishes
an immutable derived WAV asset and a separate listening-mix record. The program
monitor selects that asset only when its canonical audio identity matches the
current draft. Undo can restore a matching prior mix. Changing picture content
without changing duration or sound does not invalidate a matching audio mix.

The displayed waveform continues to represent the original song, not the new mix.
The sound strips are placement overviews, not independent waveform analyzers.

## Exact audio contract

Authored sound positions use integer stereo sample frames at 48,000 Hz. Conversion
from picture frames uses rational arithmetic and nearest-sample, half-up rounding.
For example, one picture frame at 24000/1001 corresponds to 2,002 sample frames.
The final audio length is the rounded composition length, not a sum of separately
rounded shot lengths. Audio source-in refers to the selected decoded stream after
resampling; this is not automatic camera audio/video synchronization.

A sound clip explicitly names an immutable asset and its probed audio stream index.
Only mono and stereo streams are admitted in this increment. Mono is duplicated to
left and right at unity gain. Stereo is not summed to mono. Selected source rates
are resampled to 48 kHz with no implicit loudness normalization. Sample rate bounds
are 8,000 through 384,000 Hz; actual decoding still depends on the installed FFmpeg
build and valid media. Compressed-audio delay and real-camera synchronization need
representative-media qualification before a broad support claim.

Each clip has placement, source-in, length, gain and linear endpoint-defined fades.
Fade-in starts at zero and reaches unity at its last sample. Fade-out ends at zero.
A one-sample fade silences that endpoint. Fade lengths cannot overlap each other.
Overlapping clips sum; there is no automatic crossfade, ducking, stretch, limiter,
noise cleanup or normalization. Lane and clip gains are each bounded from -60 to
+12 dB. Output attenuation is bounded from -60 to 0 dB.

Solo is shared across the song and sound lanes. Any solo excludes non-solo lanes
and the non-solo song. Mute takes precedence, including a muted solo lane. An empty
solo lane is still a solo selection. These states can intentionally yield silence;
the interface reports each lane's inclusion rather than guessing a different intent.

The song keeps the earlier fixed-zero and pad/trim behavior. A shorter song gets
explicit silence to picture end; a longer song is trimmed in the derived output.
Other sound source ranges must really decode to the requested length; they are not
silently padded to conceal missing source material. Probed duration is an early
validation bound, while decoded sample count is authoritative at render.

Summation runs in bounded 4,096-frame blocks. It checks non-finite input and output.
A mix with a sample magnitude of one or greater is rejected as `sound_mix_clipping`.
The error reports sample peaks and an attenuation suggestion; the user must choose
any gain change. No ready listening-mix record is created on this failure. Metering
is **sample peak only**, not true peak, LUFS, loudness compliance or a guarantee
against AAC/inter-sample overs. The final delivery still needs listening and proper
mastering/delivery metering for its intended use.

## Listening, persistence and export

The same normalized contract is used by the browser, server compiler and renderer.
Sound-enabled plans use version 6; unchanged legacy plans remain version 5. The
edit format remains `shutter-media-edit-v1`. Asset sources join the existing hash
verification and provenance manifest. No original asset bytes are rewritten.

A listening-mix record contains project ID, saved revision, plan hash, canonical
audio identity, derived asset ID and a report. Building a mix does not advance the
timeline revision. A later save during an earlier build does not relabel the older
result. The UI matches the authored audio identity, not simply the last render time.

A complete sound-enabled handoff includes:

- `mix-48k.wav`: aligned stereo 48 kHz, 24-bit PCM mix, after lane decisions and
  explicit output attenuation. The MP4 uses an AAC encoding of this mix.
- `master-48k.wav`, when a song is assigned: the separately aligned, unprocessed
  song derivative, before Sound Stage output attenuation.
- `stem-NN-48k-f32.wav`: one timeline-zero-aligned, 48 kHz stereo 32-bit float WAV
  per lane, after clip/lane gain and fades but **before mute, solo and output gain**.
  Muted lanes are retained so a recipient can remix them deliberately.
- `sound-report.json`: audio length, sample peaks, gain and audibility decisions,
  identity, stem labels/roles and file hashes. Existing picture, cue, manifest and
  archive outputs remain available.

Float stems can exceed unity; their format preserves those values for further
mixing, but recipients must set monitoring and mix levels appropriately. Do not
sum the delivered mix with its stems: that duplicates material. Import stems at
zero into a compatible audio editor, and apply the report's mute/solo/output
choices deliberately when reconstructing the auditioned balance.

Candidate FCP7 XML and OTIO reference the stereo mix instead of the untouched song.
They do **not** reconstruct individual editable sound clips, DAW routing, plugins,
FLP projects, Resolve audio automation or native grading projects. They remain
unverified conformed rough-cut interchange. Native Resolve/FL Studio testing has
not been performed in this environment.

## Boundaries and operational safety

At most eight lanes and 64 sound clips are accepted. All authored sample positions
and ranges fit the existing four-hour boundary. Audio jobs also have a conservative
8 GiB working-file estimate that is checked before sound decoding and before full
picture render. A long or dense job may therefore be rejected before four hours.
This is a per-audio-job estimate, not a filesystem reservation, global storage
quota, durable queue or guarantee against disk exhaustion. Picture outputs and
other application storage are outside that audio estimate.

Paths and decoder invocations use the existing local media layer; no shell command
is assembled from user text. Sources are integrity-checked. Temporary processing
uses isolated folders and failure cleanup. HTTP work goes through the existing
single-media-job lock and parent Host/Origin protection. This is not multi-tenant
authentication or production hosting isolation. No added runtime package, paid
provider, cloud rendering, DNS change or production data is required.

The unresolved compatibility guard in legacy `public/timeline.js` is deliberately
unchanged. Use `/media-studio` for these productions until that navigation path is
fixed and tested. This work does not close the earlier color-management,
RAW/ARW/HEIF, real Sony capture, native interchange or live playback release gates.

## API additions

`GET /api/media/state` now includes `listeningMixes`.

`POST /api/media/productions/:id/listening-mix` accepts `{ "baseRevision": N }` and
returns a newly built mix record with HTTP 201. A stale revision returns 409;
overload returns 400 with bounded numeric report data and no new ready mix.

The existing saved-edit commands endpoint accepts `sound-enable`, `sound-output`,
`sound-master`, `sound-track-add`, `sound-track-update`, `sound-track-remove`,
`sound-clip-add`, `sound-clip-update` and `sound-clip-remove`. Unknown contract fields,
duplicate IDs, invalid gains, unsupported streams and invalid ranges are rejected
instead of being silently normalized away. Clip identity, asset and stream changes
are not permitted through a timing/gain patch.

## Verification performed for this increment

**136 scoped Node tests passed, zero failures or skips:** 92 retained checks and
44 new sound checks. The final combined run uses the actual files in this change.
Tests exercise pure authoring, SQLite saves, revision conflicts, HTTP handling,
FFmpeg decoding and actual output media. Highlights include an independent
sample-by-sample oracle for 24,024 stereo sample frames at fractional picture rate;
source/master preservation and zero padding; mono camera-stream placement at
sample 2,002; 44.1 kHz resampling; fades across picture truncation; aligned float
stems; clipping refusal and explicit attenuation; non-finite media rejection;
working-file budget rejection; and saved-revision custody during a concurrent save.
A complete synthetic MP4, handoff and archive test exercises the integrated path.

**28 isolated DOM fixture checks passed**, including the previous 15 and 13 new
sound interactions. They exercise actual UI module bodies with fake API/storage,
all network requests aborted, and desktop/mobile layout checks. They verify
save/build interaction, stale-mix invalidation, undo restoring eligibility, the
no-song-fallback rule, gains/fades/solo controls and recovery locks.

Actual browser navigation returned `ERR_BLOCKED_BY_ADMINISTRATOR`. No policy was
changed or bypassed. DOM screenshots are synthetic fixtures, not proof of native
media playback, seeking, synchronization, reliable background audio, or performance.
No actual FX30/a6300 recording was used. HTTP tests use the actual parent server
with the existing test-only loader disabling unrelated provider/3D dependencies.
The entire pre-existing application suite and user production databases were not
exercised. These remain draft merge gates, not footnotes to a release claim.

Reproduce the scoped Node run from the complete stacked branch with Node supporting
`node:sqlite`, local FFmpeg/ffprobe, and a POSIX-compatible environment:

```sh
node --test test/music-edit.test.mjs test/music-render.test.mjs \
  test/music-http.test.mjs test/media-waveform.test.mjs \
  test/media-foundation.test.mjs test/media-http.test.mjs \
  test/timeline-contract-review.test.mjs test/sound-edit.test.mjs \
  test/sound-render.test.mjs test/sound-http.test.mjs
```

Optional isolated DOM checks require approved local Chromium and Python Playwright:

```sh
python test/browser/music-dom.py
```

## Next design gates

First qualify real browser media playback and representative camera files without
weakening the stale-mix contract. Then add titles/captions and consistent source
color interpretation across viewing copies, extracted references and delivery.
Audio improvements should proceed from measured needs: aligned per-lane waveforms,
simple automation/ducking proposals, true-peak/LUFS reporting and verified original
source handoffs. A suggestion must remain a reversible edit, never an undisclosed
change to a mastered file. These are proposed next steps, not implemented features.

Implementation reference: FFmpeg filter documentation,
https://ffmpeg.org/ffmpeg-filters.html (audio resampling, sample trimming, padding and
channel mapping). The block mixer and its numerical contract are Shutter code;
FFmpeg is used for decoding/encoding, not a hidden auto-normalizing mixer.
