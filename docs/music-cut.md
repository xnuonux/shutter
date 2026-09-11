# Shutter / Music Cut

Status: implemented experimental increment, not a commercial release.
Parent: `xnuonux/shutter` commit `1d62d5c8aa9fc9997c760ade8807f310176e6a12`, the isolated Camera & Music draft.
Route: `/media-studio`. No deployment, generation spending, DNS change or production-data migration was performed.

## The artist's experience

Bring the finished song, choose the footage, and cut picture without rebuilding the sound. A shared asset library and one saved timeline remain authoritative. This increment adds a visual picture strip, channel-separated waveform, explicit song grid and cue markers, basic reversible editorial operations, and a source/program monitoring layout. It does not create another disconnected editor database.

The master is fixed at timeline zero. Picture edits never shift it or its cues. Monitoring may continue beyond the current picture so a song can be mapped before all its shots exist. Export still ends at picture: a longer master is trimmed in the derivative delivery file, a shorter one is padded with silence. Camera audio remains excluded. These policies are stated in the interface; no normalization, remastering or hidden AI generation occurs.

### Implemented interaction

* Select and reorder shots on a visual strip. Split at the playhead; duplicate, remove, trim duration, slip the source in-point, or replace the selected take while preserving its allotted time. Fit/Fill remains ordinary resampling/cropping, not neural detail synthesis.
* Show stereo channels separately. Build a waveform explicitly; the source is decoded into a bounded extrema cache instead of loading the full PCM song into browser memory. Anti-phase material cannot disappear merely because channels were summed to mono.
* Set the tempo exported/known from the DAW, meter, beat unit and first-beat frame. Add named verse, chorus, hit or other cues. This is **manual song mapping**, not an automatic beat detector. Beat positions are individually calculated against the absolute rational clock, avoiding cumulative round-to-frame drift.
* Source/program layout, native monitoring controls, frame-step shortcuts, loop-selected-shot, cue navigation and snap-to-beat/cue placement. Space plays/pauses, arrows step, Shift+arrows move about one second, S splits and M adds a cue. Native browser media seeking and switching are **not frame-certified realtime playback**.
* In-memory undo/redo before Save. Up to 80 local history entries; new edits fork and clear redo. Explicit Save advances the existing server revision. Saved revision undo/redo remains available after local history is exhausted.
* Best-effort browser-local draft recovery, bound to both the saved revision number and the compiled plan hash. Recovery requires a choice. A conflicting draft can be exported or discarded, never automatically saved over a newer cut. Edit controls and keyboard history are blocked while that choice is unresolved. Storage can be disabled or exhausted: explicit server Save remains necessary.
* Search material by filename. The earlier frame-extraction, photo-copy, proxy and handoff operations remain available.

## Timing correction, not just new controls

The renderer previously reset cadence when a fractional-rate shot was divided. A new optional `sampling` record preserves the source origin plus an integer output-frame offset. After converting a source to the production clock, each split selects the appropriate portion of that same clock. `sourceStart` remains the effective rational in-point and must agree with the origin/offset; contradictory data is refused. Slip and take replacement deliberately establish a new source origin.

`compileMediaEdit` now emits plan version **5**. Source assets, the v1 edit format and the generic SQLite timeline store are retained. Optional music/markers/sampling metadata does not require a SQL migration. Saved plans/hashes change under this compiler; local recovery correctly treats a changed plan hash as a conflict. Do not downgrade this compiler and assume identical render semantics for new splits.

An actual regression also found that requesting an exact count of filtered frames was insufficient to ensure the encoded MP4 declared the requested fractional frame rate. Every conformed shot now specifies output `-r <exact fps>` and `-fps_mode cfr`, then is decoded/probed to verify count, dimensions and rate. Final picture count/rate and delivery sample count remain checked before a ready cut is registered.

## Architecture and API

`public/music-edit.mjs` is a pure shared browser/Node edit module. It does not read assets, schedule work, call providers, mutate its caller's document or generate random identifiers. IDs are supplied by the caller. The authoritative server compiler still validates media profiles, source handles, supported policies and output bounds.

`src/media-waveform.mjs` streams 48 kHz float PCM from the local FFmpeg child process. Native mono/stereo channels stay separate. Adjacent peak buckets merge as the cache reaches its bound, retaining extrema with at most 8192 bins per channel. Results state their measurement: sample extrema, **not LUFS or true-peak metering**. The source hash and cache schema are checked. Only complete successful decodes become ready records. The child has a 180-second bound, abort handling, no shell, bounded stderr and the existing decoder protocol restrictions. No OS decoder sandbox is claimed.

`public/music-room.js` owns transient transport/selection and draws a bounded canvas. `public/media-studio.js` keeps the one editable draft, explicit Save, local history and recovery. `public/edit-recovery.mjs` provides a testable revision/hash contract. There is no parallel timeline authority.

New routes, reached only after the original localhost/Origin/Sec-Fetch-Site gate:

```
GET  /api/media/assets/:id/waveform
POST /api/media/assets/:id/waveform               body: {}
POST /api/media/productions/:id/commands          body: {baseRevision, command}
```

A cache miss returns 404; waveform creation is explicit. Commands include `split`, `trim-end`, `slip`, `replace`, `move`, `remove`, `duplicate`, `fit`, `music`, `marker-add` and `marker-remove`. Stale base revisions return 409. Rejected commands leave the saved revision unchanged. The browser normally stages local edits and uses the existing timeline PUT when the artist chooses Save; the command endpoint exposes the same bounded edit language to integrations without prompt-to-provider side effects.

No new runtime package or external service is required by this increment. The existing local Node/SQLite and FFmpeg/ffprobe requirements still apply.

## Interchange additions

Each completed handoff adds `cues.csv`, including label, kind, exact output-frame index, seconds, exact FPS and whether a cue falls inside the picture. Spreadsheet-formula prefixes are neutralized and cells are quoted. FCP7 XML and OTIO carry in-picture markers; out-of-picture cues remain in CSV and the Shutter plan. Relative media paths and conformed H.264 rough-cut files retain their previous limitations. Import/relink inside a native editor still needs testing.

Do not advertise this as native `.flp`, `.drp` or `.psd` reconstruction, camera-original grading interchange, retained plugin state or certified bidirectional round-tripping. The PCM master and explicit timeline handoff are the current supported interchange boundary.

## Verification actually performed

Environment: Node **22.16.0**, FFmpeg/ffprobe **7.1.5-0+deb13u1**. All media fixtures were synthetic and isolated from user production data.

**92 scoped Node checks passed, zero failures/skips**, comprising the prior 54 media/SQLite/HTTP/compiler checks and 38 new music/edit/waveform/HTTP/render checks. The new checks exercise rational edits, handles, song-grid arithmetic, history, recovery, channel extrema and compaction, corruption/cancellation, immutable source bytes, revision conflicts, static routes, waveform HTTP, origin gates, cue interchange and actual fractional-rate exports.

A synthetic 30000/1001 source with a one-third-second in-point was split at unequal output positions on a 24000/1001 timeline. Decoded pre-encode picture MD5s from all split pieces equal the unsplit sequence and a separate conform reference. The saved split cut produces exactly **72 pictures at 24000/1001**. Existing mixed-rate 60-picture/120120-sample PCM, synthetic 4K 10-bit 4:2:2, 36 MiB streamed upload, and independent 100-seeded-fixture compiler checks were rerun and passed. These are software/fixture results, not a claim that Sony-specific capture modes are qualified.

**15 isolated DOM-fixture checks passed**, exercising the actual UI module sources in an empty Chromium document with fake API/storage and all network requests aborted. They cover boot, split, local undo/redo, save binding, search, music map, cue placement beyond picture, recovery locks, no uncaught exceptions, and no page-width overflow at a 390-pixel viewport. Desktop/mobile screenshots document this fixture. Their empty media viewers are expected: this is **not playback evidence**.

Real server navigation in Chromium remains blocked by administrator policy (`ERR_BLOCKED_BY_ADMINISTRATOR`). No policy was changed. HTTP tests exercised the actual parent server using the existing TEST-ONLY loader that disables unrelated provider/3D dependencies. The whole pre-existing application suite, actual provider jobs and user production databases were not run here.

Reproduce the scoped Node checks from a complete checkout with this increment applied:

```sh
node --test test/music-edit.test.mjs test/music-render.test.mjs test/music-http.test.mjs test/media-waveform.test.mjs test/media-foundation.test.mjs test/media-http.test.mjs test/timeline-contract-review.test.mjs
```

Optional, separately labeled DOM checks require Python Playwright and a locally installed Chromium; they are development-only dependencies, not silently installed app requirements:

```sh
python test/browser/music-dom.py
```

The optional harness records its source hashes, uses only a synthetic document/API/storage, aborts every network request and does not modify browser security policy. Set `SHUTTER_TEST_CHROMIUM` to the approved local executable when needed.

## Release boundaries and next gates

This is local experimental editing, not the finished hosted shutter.video product. The parent PR's unpublished `public/timeline.js` compatibility guard remains a known integration blocker. That file is deliberately not changed by this increment; open asset-backed productions via `/media-studio`. A reviewer must resolve legacy Edit navigation before merging an editor migration.

Before an artist-ready beta, qualify actual FX30/a6300 fixtures, browser audio/video synchronization and seek/switch behavior, consistent color across viewing proxies/references/export, save/reopen recovery under tab/process failure, and native Resolve and DAW handoffs. Add independently placed sound lanes and waveform trim monitoring without modifying mastered sources. Finishing tools (titles/captions, independent sound, color, robust preview, relink) precede more providers.

Preserve these product rules while expanding: zero-credit manual editing is useful; paid generation requires a clear reviewed action; camera originals and the master are protected; every derivative remembers its source; uncertain reconstruction is reviewable; saved exports identify their exact revision. Neural upscaling, automatic beat detection, mixed-mode HDR/log grading, RAW photo development and native project-file reconstruction are not included here.

A later provider proposal can use accepted first/last-frame assets and real footage references. It must expose actual model capabilities, cost and limits. It must not imply that an ending-frame prompt ensures seamless motion or that every provider supports reference video. Titles, color management, multitrack sound and durable processing are separate next implementation gates, not buttons falsely marked complete.

## Primary implementation references

The following were consulted for technology/workflow context, not as validation of Shutter:

* FFmpeg filter documentation: https://ffmpeg.org/ffmpeg-filters.html — `fps`, trim/pts and audio filters.
* FFmpeg CLI documentation: https://ffmpeg.org/ffmpeg.html — output frame-rate behavior.
* Image-Line export documentation: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/fformats_save_export.htm — rendered audio rather than native plugin/session reconstruction.
* Blackmagic Design Resolve edit workspace: https://www.blackmagicdesign.com/products/davinciresolve/edit — editing workflow context, not proof of our XML import compatibility.

Actual test logs, source hashes, incremental patch and DOM screenshots accompany the downloadable engineering package. Do not use fixture screenshots as a claim of actual camera playback or a completed client production.
