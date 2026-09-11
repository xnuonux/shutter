# Finish: titles, lyrics and captions

Date: 2026-09-11. Experimental local `/media-studio` increment, stacked on Color Prep at `8d20ddcf4392d4cd5fbada0f346397a2af53aa21`. Nothing in this increment merges or deploys the application, changes DNS, processes private production data, or spends generation credits.

## Artist outcome

Bring your music and picture into the existing cut, then author a centered title, a lower-third label, or timed caption/lyric lines. Text belongs to the production's output-frame clock, not to a source shot. Reordering or replacing picture does not move words or sound. All text changes participate in the existing local undo/redo, revisioned saves, and recovery validation.

Captions default to separate SRT and WebVTT files. Burning them into the video is an explicit option. Titles and lower-thirds are burned into the finished MP4. The conformed editorial shot files remain clean. The exporter also writes a frame-exact `text-layer.json`; native XML/OTIO handoffs do **not** reconstruct the title layers or automatically import captions. Do not enable sidecars over an already caption-burned video without considering duplicate display.

No transcription is submitted. No model, external media service, new npm runtime dependency, font file, commercial template, or third-party implementation source is added.

## Workspace flow

1. Open an asset-based production in `/media-studio`, then expand **Finish · titles, lyrics & captions** beneath Sound Stage.
2. Choose a treatment and set integer start/end frames. The start is included; the end is excluded. “Start at playhead” and “End after this frame” set those boundaries explicitly. Add/update the cue to apply the form to the draft; an unfinished form blocks saving or requesting a compositor check rather than being silently ignored.
3. Find words in the cue list, select a cue to seek to its start, and edit or delete it. Long lists show the first 100 search matches without removing any underlying cues.
4. Choose separate captions or burn-and-sidecar. Browser text is a labeled approximate monitor. Its font shaping, line wrapping and appearance are not authoritative export evidence.
5. Review source color, then use **Save & check compositor frame**. The backend saves no invented camera properties: it renders the chosen global frame using the existing picture conform and the export text engine, with the selected caption-delivery policy. The PNG is a separate shared asset, bound to the saved revision, plan hash, source checksum and text settings. Changed drafts make old checks historical. A late response cannot attach to a different production.
6. Render the saved cut through the existing delivery path. Inspect the actual MP4, and retain the clean editorial handoff plus caption sidecars and exact JSON.

The timeline remains unmanaged SDR. A compositor PNG is not calibrated color proof. The Color Prep path remains available, but preparing one source does not color-manage an arbitrary mixed composition.

## Text and interchange contract

Optional `textLayer` schema: `shutter-text-v1`. Old projects with no text layer remain unchanged. Compiler version is 7 when a layer exists; the prior no-text version selection remains intact.

```json
{
  "schema": "shutter-text-v1",
  "captionDelivery": "sidecar",
  "cues": [
    {"id": "opening", "kind": "title", "startFrame": 0, "endFrame": 48, "text": "My film"},
    {"id": "line-one", "kind": "caption", "startFrame": 48, "endFrame": 96, "text": "My own words."}
  ]
}
```

Each cue has a safe unique identifier, an allowlisted treatment, bounded integer half-open interval, and plain Unicode text. Limits are 2,000 cues, 480 Unicode code points and three explicit lines per cue, and four simultaneously active layers. Caption-caption overlap is rejected; adjacent boundaries are valid. Literal braces and backslashes, controls, malformed Unicode and subtitle override syntax are rejected. Tag-shaped caption markup is rejected; title text that resembles HTML is rendered literally and never inserted as executable HTML. The form's HTML `maxlength` is a conservative UTF-16 limit.

Text beyond the picture is retained for editing but blocks export. Long lines, high character rate, and lower-third/caption overlap are review prompts, not automatic corrections or accessibility-standard certification. There is no semantic reading-quality, translation, speaker identification, animated karaoke, arbitrary font upload, freeform text positioning, or full subtitle styling model.

The importer accepts a deliberately strict **plain-text UTF-8 SRT/WebVTT subset** up to 1 MiB, including BOM/CRLF, SRT indices, WebVTT identifiers/NOTE comments and the six predefined WebVTT character references. Imported styles, cue settings, regions, timestamp maps and inline tags are rejected atomically instead of silently discarded. An import is reviewed before applying. “Replace captions” preserves titles. A new failed/oversized selection also invalidates an older in-flight file read.

Import uses integer/rational arithmetic and rounds each timestamp upward to the first applicable output frame. A cue that disappears at that precision is rejected. Export floors frame boundaries to milliseconds, less than 1 ms early; the exact frame values remain in JSON. This policy makes Shutter export/reimport stable at the supported fractional rates without implying that every external editor uses the same rounding.

## Rendering design

`src/media-text.mjs` invokes the **installed** FFmpeg/libass complex-shaping renderer. `SHUTTER_TEXT_FONT` optionally names an installed font family; the default is DejaVu Sans. No font files are bundled. Installed fallback and shaping can differ between machines; their selection and tool version are recorded. Missing glyph/fallback errors and truncated font evidence reject the operation rather than presenting a successful review.

ASS event timestamps have a different precision model from the output frame clock. This implementation temporarily assigns one second to each decoded frame (`setpts=N/TB`), positions internal ASS events at whole-frame indices, then restores the original rational output clock before encoding. The temporary ASS is **not** valid real-time subtitle interchange and is removed after processing. Single-frame fixtures at 24000/1001 and 120 fps test the resulting decoded picture sequence directly.

Picture is first conformed using the existing preserved sampling clock. Active text is burned across the concatenated picture, not separately restarted per shot. A burned-text export currently adds an H.264 encoding pass: it is a rough-cut delivery path, not a lossless mastering pipeline. Clean shot handoff files are retained. Sound is muxed afterward using the existing soundtrack/Sound Stage path; no normalization or limiter is introduced.

`renderMediaTextFrame` uses the selected shot's preserved source sampling phase and the requested **global** output frame. It verifies the recorded source checksum, requires the exact base revision and existing unmanaged-color acknowledgement, records historical identity even if another edit occurs during processing, and cleans scratch files. The HTTP request propagates disconnect cancellation into the frame decoder and text renderer. Full-cut export retains its previous operation lifecycle; this increment does not add a persistent queue or a dedicated cancel interface.

Inputs are validated at both shared editing and server compilation boundaries. External commands use fixed arguments without a shell, restricted media protocols, bounded diagnostics and finite timeouts. These are defensive process controls, not an OS sandbox. Parent localhost/Host/Origin gates remain unchanged; they are not hosted tenant authentication.

## Code map

- `public/text-edit.mjs`: shared schema, pure edit commands, timing conversion, strict import, sidecar export and review observations.
- `src/media-text.mjs`: frame-clock ASS, installed-engine preflight, rendering evidence and handoff files.
- `src/media-edit.mjs`: compile integration, clean/burned export separation and saved compositor frame.
- `src/media-api.mjs`: protected static modules, revisioned text commands and `/api/media/productions/:id/text-preview`.
- `public/text-room.js` / `.css`: contextual Finish inspector and approximate draft text monitor.
- `public/media-studio.js` / `.html`, `public/music-room.js`, `public/music-edit.mjs`: shared workspace, save/recovery, program view and frame-rate protection.
- `test/text-contract.test.mjs`, `text-render.test.mjs`, `text-http.test.mjs`, `test/browser/text-dom.py`: new checks; the retained Music UI fixture now loads the actual new modules.
- `test/text-demo.mjs`: reproducible synthetic picture/tone demo. It writes separate proof, video, caption files and recorded evidence; no user footage or song is used.

## Verification performed

**286 scoped Node tests passed:** 227 retained plus 59 new (37 contracts, 12 actual-media checks, 10 actual-parent HTTP checks). The workspace was reconstructed from the preceding implementation packages, not cloned as a complete repository. All modified baseline files were checked against the exact GitHub parent blobs. The actual-parent HTTP fixture disables unrelated provider/3D modules via the existing test-only loader. The complete original application suite and provider integrations were not run.

New media evidence includes exact 12-frame text masks at 24000/1001 and 120 fps, title/caption spans across a 17-frame two-shot cut, clean handoff picture without text pixels, and **34,000 aligned stereo PCM sample frames** compared with the source's integer samples. Source hashes remained unchanged in the fixtures. Missing glyphs, cancelled requests, stale revisions and text outside picture were exercised. SRT/VTT round trips were independently checked across six frame rates and hundreds of intervals per rate. These are synthetic regression checks, not broad device or format certification.

**94 isolated browser-interface checks passed:** 66 retained plus 28 new (23 Finish component checks and five additional parent-workspace checks). Actual modules were evaluated against synthetic state and callbacks with all networking aborted. They check form application, caption policy, frame boundaries, search, atomic imports, stale/late results, HTML escaping and mobile viewport containment. The screenshot embeds the actual locally rendered synthetic compositor PNG, but its surrounding state remains an interface fixture.

An ordinary localhost browser navigation was attempted and returned **ERR_BLOCKED_BY_ADMINISTRATOR**. No policy was changed or bypassed. Actual media playback, synchronization, browser seeking and full browser/server operation therefore remain unqualified. So do real FX30/a6300 media, calibrated display behavior, native Resolve/FL Studio import, original-media relinking and the existing legacy Edit compatibility issue. Continue to use `/media-studio`; no unpublished legacy guard is included.

### Reproduction from a complete checkout of the proposed branch

Requires Node with `node:sqlite`, installed FFmpeg/FFprobe with libass and the existing codec dependencies. The test environment used Node 22.16.0 and FFmpeg 7.1.5. Optional DOM checks require Python Playwright and an installed Chromium; no browser package is an application dependency.

```sh
node --test --test-concurrency=2 test/text-contract.test.mjs test/text-render.test.mjs test/text-http.test.mjs
node test/text-demo.mjs
python test/browser/music-dom.py
python test/browser/delivery-dom.py
python test/browser/color-dom.py
python test/browser/text-dom.py
```

The conversation package contains the full scoped test log, source hashes, verified patch, replay checks, interface checks, ordinary navigation failure record, synthetic demo and this handoff. `node --test test/*test.mjs` in a **complete** repository also selects older application tests that were not present in the scoped workspace; do not equate that command with the reported 286-check run without consulting the log's selected files.

## Primary technical references

Consulted 2026-09-11; original implementation written for this increment, not copied from these sources.

- FFmpeg `ass` / `setpts` filter documentation: https://ffmpeg.org/ffmpeg-filters.html#ass and https://ffmpeg.org/ffmpeg-filters.html#setpts_002c-asetpts
- W3C WebVTT specification: https://www.w3.org/TR/webvtt1/
- Aegisub ASS override/reference documentation: https://aegisub.org/docs/latest/ass_tags/

The timestamp clock transformation and strict supported subset are Shutter design choices, not claims that these references certify the implementation. Desktop distribution still needs review of the exact FFmpeg/libass/dependency/codec build. No downloadable font or binary is provided.

## Next most valuable release work

The next integration gate is one ordinary real-media browser journey with saved-state recovery, seeking, current audio monitoring and exported text compared against the saved compositor frame. The existing admin restriction prevents qualifying that here; do not replace it with a simulated test and call it complete. In parallel, source relinking/handles and a verified native-editor handoff remain higher value than an expanding list of animated text styles.
