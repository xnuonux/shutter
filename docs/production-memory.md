# Production Memory, Scout and Take Stacks

September 11, 2026. Experimental local `/media-studio` increment, based on published editor commit `89b9c4eb18c684d7d8ce591a7b0760ac8f064c61` (Media Recovery / draft PR #7). The founder-approved vision on the default branch remains the north star. This implements a connected **source range → searchable moment → collected alternative → audition → accepted shot** workflow; it does not claim the entire semantic Production Memory or Generative Inserts vision is finished.

## Artist workflow

Open an asset-backed production in `/media-studio`, choose footage in Material, and expand **Production Memory** beneath the viewers. Mark the useful part of a source, name it, add a short observation and tags, and optionally favorite it. A moment can be the few seconds before a turn, a close-up suitable for a chorus, or a photographed reference you want to reuse. The words are visibly **artist-authored**, not invented model observations.

Search your labels, notes, tags and original filenames. Search returns the actual marked range, not merely a file name. **View range** selects the source, seeks to the marked beginning, and requests a pause at its end. Browser playback/seek behavior is not qualified here. Searching for `night close` can match your tagged night close-up; it does not look at unlabelled footage and infer that it contains a person at night.

For a visual overview, mark up to 120 seconds of footage and choose **Scout this range**. Local FFmpeg detects visual changes and makes a bounded contact sheet. Long continuous intervals receive additional ten-second browsing windows, explicitly distinguished from observed changes. Select a pictured interval, review it, and supply your own description before saving it as a moment. No automatic footage upload or paid analysis occurs.

Choose a target shot and **Collect for shot**. The application explicitly saves the current cut before collecting, retains its original source selection, and adds a snapshot of the chosen moment as an alternative. Collection itself does not replace picture. The stack can retain up to 24 selections per shot.

**Audition** temporarily substitutes that source in the Program viewer while keeping the underlying edit and audio selection unchanged. Use the existing transport to inspect it in context; it is marked as unsaved audition. **End audition** returns to the authored cut. Changing the actual draft also ends the temporary comparison. This is not live Jam Cut recording, automated musical alignment, or frame-certified browser playback.

**Use take · keep timing** accepts the alternative into the existing revisioned timeline. Only the source asset, source start and sampling origin/offset change. Shot duration, placement, Fit/Fill, song, sound lanes, cues, and finishing text stay fixed. The candidate must contain enough marked source time to fill the shot; short candidates remain visible but cannot be silently stretched. Saved undo restores the previous timeline, and the preserved original can also be reselected.

## What is implemented, and what is deliberately not

Implemented: persistent source-range notes; local word/prefix search; favorites and pagination; cached visual scouting; source-linked take stacks; noncommitting in-context auditions; explicit, revision-guarded acceptance; existing save/undo/recovery integration; metadata notebook export.

Not implemented: semantic embeddings, automatic subject/identity recognition, shot-quality scoring, scene descriptions, lyric transcription, cloud indexing, batch unattended analysis, new model adapters, generated continuations or bridges, generation spending, model routing, automatic continuity judgments or automated music-video editing. Those should build on the evidence/source/selection contracts here rather than being represented by a convincing but unsupported label.

This branch is based on the actual published Media Recovery head. The preceding **Editorial Handoff** package was local-only and is not silently incorporated or claimed as published. Existing generated videos already registered as ordinary verified media can be used as alternatives; this increment does not create or submit a generation request.

## Storage, timing and provenance

Authored `memory-moment` and `take-stack` records use the existing SQLite journal. There is no second timeline store. A rebuildable SQLite FTS5 index is initialized lazily and kept synchronized with insert/update/delete triggers. Search is project-scoped. User query terms are converted to literal quoted prefixes; FTS operators and SQL are not accepted as executable syntax. Diacritic-insensitive matching is configured with `unicode61 remove_diacritics 2`.

Source ranges use integer microseconds. Inputs accept at most six decimal places; editing only a label preserves the original exact boundary rather than rounding it to the three-decimal display label. Fit checks use rational arithmetic against the output rate and marked source end. Original selections retain their existing sampling origin/offset: restoring a split shot does not restart its prior frame-rate-conversion pattern.

A saved moment records its source checksum, filename, probed technical fields, author-evidence designation and revision. Editing it requires its current revision; source/project rebinding is rejected. Collecting a moment snapshots that revision, its description, range and source checksum. Later note changes or deletion do not rewrite an already-collected alternative. Global journal identifiers are checked against record kind so a forged note or cache identity cannot overwrite a timeline or another record type.

Take collection and acceptance check both the timeline revision and stack revision. Collection also checks the moment revision. Source bytes are verified before accepting, and the timeline/stack revisions are checked again after asynchronous verification. The final save is synchronous with those checks. A changed source or stale proposal is rejected rather than silently applied to a different cut. This is not certification against a privileged adversary changing the filesystem at arbitrary instants.

`Export memory notebook JSON` contains notes and stack metadata. It is not a portable media backup, a database recovery bundle, or a native NLE project. Existing handoff ZIPs are not expanded to include this notebook automatically. The journal retains it for existing full-studio backup paths; those backup paths were not newly qualified in this increment.

## Scout boundaries

The scout uses installed FFmpeg `scdet` plus metadata output. It records source-relative visual-change times, separates artificial browsing windows, and samples at most 12 thumbnail intervals. The source is verified before and after processing, and the cache binds its checksum to the explicit range and threshold. A cache hit is marked as reused. A missing or changed derived thumbnail causes an explicit rerun to rebuild the cache instead of treating missing evidence as current.

The first implementation decodes from the source beginning to preserve its normalized timing, then selects the requested interval. A late interval in a long source can therefore cost more work than its selected duration suggests. Each subprocess has a finite timeout; inputs, diagnostic output, event counts, image size and output count are bounded. This is not a throughput benchmark, persistent queue, or guarantee that every long source finishes within those limits.

Thumbnails are small unmanaged-color browsing images, not calibrated color proofs, full-resolution generation references or exact-frame certificates. Known HDR transfer functions are rejected. Very short intervals use a conservative nominal-frame choice; actual variable-frame-rate behavior and camera-specific timestamps need further fixtures. Change detection does not establish narrative scene boundaries, useful performance, focus, identity or artistic quality.

Scratch paths are generated locally, not supplied by the caller. Scout cache paths/images are bounded and checked, symbolic links are rejected at the checked boundaries, and failures clean scratch directories. Source and collected media are never deleted as part of note editing or scouting. These controls are not an operating-system sandbox or complete hostile-filesystem protection.

## UI safety and integration

The new contextual panel uses the existing state, viewers, timeline, transport and sound monitor. A transient audition affects only Program selection; it does not change `getEdit()`, the saved revision, media files or the current audio-mix identity. A playback error preserves the audition warning. Selecting a source elsewhere can pause playback as before.

Late search, scout and stack responses retain their originating project/query/range/shot context. A stale stack cannot authorize acceptance into a newer saved cut. Unfinished moment notes receive visible pending status and protection during explicit moment/take operations, project switches and ordinary beforeunload. This is not guaranteed browser crash recovery for text that has never been saved as a moment.

The existing parent Host/Origin/Sec-Fetch-Site checks run before new routes. They are local single-user controls, not hosted account authentication. The new routes execute no arbitrary shell commands or network generation calls. No runtime npm dependency, model weights, binary, font file, or third-party source implementation is bundled.

Key modules:

- `public/memory-contract.mjs`: plain notes, source time, lexical query and source-only take proposal contracts.
- `src/production-memory.mjs`: journal records, derived FTS index, revision checks and take acceptance.
- `src/media-scout.mjs`: bounded local scene-change observations and cache.
- `src/memory-api.mjs`: protected memory/take/scout HTTP routes, delegated by `media-api.mjs`.
- `public/memory-room.js` / `.css`: source notebook, search, stack inspector and scout overview.
- `public/music-room.js`, `media-studio.js` / `.html`: transient Program audition and parent integration.

## Verification performed

**392 scoped Node tests passed**, with zero failures, cancellations or skips: **337 retained plus 55 new** (18 shared contracts, 25 journal/scout/media tests, and 12 actual-parent HTTP tests).

The fixtures used real temporary files, SQLite, FFmpeg decoding and exports. A three-second synthetic source with known changes at one and two seconds produced both observations at those times. Nonzero starting ranges, a one-frame selection, cached reuse, missing-thumbnail repair, cancellation, invalid source ranges and record-identity collisions were exercised.

The end-to-end backend fixture exported a 24-frame shot at 24 fps with a title and aligned song, accepted a different take, exported again, restored the original and exported a third time. The alternative changed decoded picture; restored-original decoded frame hashes matched the first export. The aligned WAV was identical across the take change, and original source hashes remained unchanged. These are bounded synthetic regressions, not qualification of Sony recordings or every file/codec/timebase.

**137 isolated interface checks passed:** 112 retained plus 25 new (20 MemoryRoom checks and five parent-workspace/audition checks). Actual modules ran with synthetic state/API callbacks and all networking aborted. Checks include exact timing through note edits, search/stale responses, short candidates, save/discard behavior, audition isolation, literal HTML handling, project changes, mobile containment and leave warnings. The screenshots are explicitly labelled synthetic interface fixtures, not live production screenshots.

The workspace is a **scoped reconstruction**, not a full repository checkout. Actual-parent HTTP tests use the existing test-only loader that disables unrelated provider/3D modules. The complete pre-existing application suite, provider integrations and native desktop software were not run. Baseline files changed by this increment are compared against the published parent's Git blobs; the download contains exact test selection, source hashes and patch replay evidence.

An ordinary localhost Chromium navigation was attempted against the actual parent server and returned **`ERR_BLOCKED_BY_ADMINISTRATOR`**. No policy was changed or bypassed. Actual browser/server playback, seeking, synchronization, real FX30/a6300 footage, calibrated color, Windows/macOS behavior and native Resolve/FL Studio interoperability remain unqualified. The earlier legacy Edit compatibility issue remains: use `/media-studio`.

### Reproduce focused tests

Requires Node with `node:sqlite` and FTS5, plus installed FFmpeg/FFprobe and the existing media dependencies. Tested environment: Node 22.16.0; FFmpeg 7.1.5. Optional isolated UI checks use Python Playwright and installed Chromium, not a runtime application dependency.

```sh
node --test --test-concurrency=2 test/memory-contract.test.mjs test/production-memory.test.mjs test/memory-http.test.mjs
python test/browser/music-dom.py
python test/browser/memory-dom.py
```

The complete scoped run selected the test filenames recorded in the package's `verification/node-test-files.json`. A full checkout may contain additional tests; do not equate a larger wildcard run with the reported scope without checking its selected files.

## Primary references and next step

SQLite FTS5 documentation: https://www.sqlite.org/fts5.html
Node SQLite API: https://nodejs.org/api/sqlite.html
Installed FFmpeg reference used: `ffmpeg -hide_banner -h filter=scdet` and `ffmpeg -hide_banner -h filter=metadata`.

The implementation is original Shutter code, using those existing interfaces rather than copying external product source or bundling a model. No claims about current provider pricing/capabilities are introduced here.

The next connected development target is a **reviewable Generative Insert request** bound to the selected source range, clean reference frame(s), target slot and immutable original. Provider support, data leaving the device, price limits, uncertain-submission reconciliation and visual acceptance must be explicit. Returning outputs should enter these take stacks as candidates, not silently replace the artist's shot. Semantic analysis should add versioned model evidence beside artist notes, not overwrite them or pretend local keyword search already supplies vision understanding.
