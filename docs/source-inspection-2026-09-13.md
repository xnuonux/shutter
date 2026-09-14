# Source motion inspection

September 13, 2026. Code `64f599d` is integrated locally in `C:/dev/shutter` on `codex/shared-scene-timeline`, with the same code in the retained integration worktree. This milestone adds a source-observation primitive to the existing Director tools and Moments panel. No provider, external publication or paid generation was used.

## What works

`shutter_inspect_source` takes an existing video asset and a 0.125-15 second range in integer microseconds. It returns 2-12 chronological JPEG images (default 8), a silent 640 × 360 local MP4, and a manifest describing the source, conformed interval, sampling positions, gaps and media hashes. `includeImages: false` provides metadata alone. The catalog and MCP schema explain the limits and side effects.

The clip uses the existing exporter's 24 fps source-sampling clock and contained framing. Sample positions are evenly spaced playback frames, including first and last. The nominal source clock is not original frame PTS; the manifest states that distinction and that the conformed range can omit a tail shorter than one output frame. The filmstrip is sparse evidence. A director can narrow the range for fast action rather than assume it saw the intervening frames.

**Moments → Mark a useful source range → Inspect motion** runs the same service. The artist can play the interval or click a sample to seek to it. Editing bounds withdraws the old playback, and a delayed response cannot replace a changed range. Inspection leaves the unsaved note form, saved cut and source library intact. The coarse scene-change scout remains available separately.

Playback initially decoded but could not seek in Chromium: the browser reported a seekable interval of `[0,0]` despite a complete two-second buffer. The final route uses the existing `byteRange` implementation for GET/HEAD. Real HTTP tests check 206/416 responses; the browser now reaches the final frame through a sample click and plays forward successfully.

## Verification and preservation

- Full suite: **528 tests, 526 passed, zero failed, two existing Windows symlink skips**.
- Three new actual MCP/HTTP/FFmpeg tests cover chronological image delivery, playback frame counts, original source interval selection, matching image/playback pixels, byte-range reads, strict bounds, cache reconstruction, corrupt original bytes, cancellation and a source-profile change during decoding. The shared MCP image reader retains its existing hostile URL/hash/size tests.
- **12 real browser checks** passed for decoding, seeking, playback, preserved note/cut/library, visible sampling limits, mobile layout and late-response withdrawal. Desktop and mobile screenshots were visually inspected.
- **20 existing Memory component checks** passed with their original synthetic API fixture. These are separate from the real playback checks. **3 read-only canonical browser checks** passed after integration.
- Independent read-only review found no concrete issue in the service or final UI/range-delivery changes. Parent execution supplies the verification counts.
- Canonical original data remains **78 records and 19 request entries**, unchanged raw ordered `{rows,requests}` SHA-256 `7d9b4326b5dd79bf02451228aecda069af83cf9227b5a326728d34da43013663`.

Canonical app: localhost4677, PID25692 at verification. Review app: localhost4688, PID6404. Verify process ownership before a later restart. The successful disposable browser production is `prod_6d712f39-1f88-4102-866e-a3244899440f`, with its original four-second main cut unchanged and no saved notes. The test finishes with an unsaved changed range to prove stale-result withdrawal; use Moments to inspect it again. Earlier failed-browser fixtures are preserved rather than removed.

Task evidence lives in `outputs/shutter/source-inspection-2026-09-13/` under task `01a087ae-15fc-7e43-8eb2-126e7883d103`. It contains test output, browser receipts/screenshots, review notes and original-data preservation receipts.

## Limits and next work

An MCP client receives images and a playback URL; it has not automatically watched a native video. The clip omits audio and does not composite the scene's sound, titles or camera coverage. Sampling does not certify identity, movement, story or continuity. Known HDR must use the existing preparation workflow; this is unmanaged review media, not a grading or generation reference.

The cache is separate from the asset library. Source/profile identity and media hashes are checked before reuse and publication. Decoders use the existing cancellation/deadline mechanism, with a 90-second signal, 12-image maximum, 256 KiB per image and 16 MiB playback limit. Partial results are removed after cancellation/failure. Original-source verification can include a full file hash.

**$0 spent.** Old fal balances are stale; refresh the actual balance and receipts before paid work. The future $10 Eternities commercial remains separately unfunded. Original Lunari, Moment, Blender and footage remain preserved.

Next bounded candidate: make review of an assembled scene's motion and sound discoverable through the same Director interface, reusing the existing saved-edit compiler, player and local exporter. This would complete the observation step after an edit. Pixel's planning loop and full episode continuity remain larger unfinished work.
