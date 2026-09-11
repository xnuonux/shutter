# Media health, exact-file recovery and transport hardening

2026-09-11. Experimental local `/media-studio` increment based on Finish commit `5dd61151ac762d80d611f14567c8a6ef20d85ece`. This does not merge the stacked feature branches or deploy a public service.

## What the artist can do

Open **Media health & recovery** in Material, save the current cut, and run its checksum scan. Each referenced asset is classified as verified, missing, changed or unassessed. The scan includes picture, the master song, all authored Sound Stage clips (including muted lanes), and the most recent viewing copy selected for each source. Repeated uses are listed together rather than hashed repeatedly.

A missing registered file can be restored from a file chosen explicitly in the browser. Its name may differ, but its byte count and full SHA-256 must match the saved asset identity. Uploads are streamed to a private staging file, synced and independently rehashed before publication. The operation never substitutes a new take, re-encodes media, changes the original asset record or profile, or edits timeline settings. Publication uses a no-overwrite hard link on the same filesystem. A retry after successful installation is idempotent.

**This restores absent library files, not a missing database, an erased recording without a surviving copy, or a different edit of the same shot. Existing damaged files are deliberately protected, not overwritten or deleted.** There is no automatic search of external drives or arbitrary server-path picker. Prepared video and proxies are also content-addressed assets; restoring one requires its exact bytes, not merely its ancestor's camera recording.

After restoration, the viewers are refreshed and the old health report is historical. Run another scan for fresh evidence. An unsuccessful recheck also invalidates the previous current indication. Draft edits, pending text forms, revision changes and late results cannot silently attach old evidence to a different project. Reports remain downloadable JSON with timestamps and exact saved revision.

## Why this was necessary

The previous importer deduplicated by SHA-256 but rejected a duplicate upload when its existing asset record pointed to a now-missing file. A regression reproduces that failure before using the explicit restore operation. Recovery uses the existing asset identity rather than creating a fake generation job or remapping every edit reference.

The older Edit UI also assumed every production had `main` and `coverage` arrays. A locally implemented and tested format guard presents a link to `/media-studio?project=...` for asset-backed productions before accessing those old structures. Empty and populated camera productions are covered, as is ordinary rendering of a legacy main/coverage production. The connector blocked uploading this legacy source file, so the guard is **local-only**, supplied separately as `verification/local-only/legacy-navigation-guard.patch`. It is not in the GitHub branch or counted in the published-branch UI checks. The legacy navigation issue remains a release gate. This is a narrow proposed fix, not a merger of the two editing interfaces.

## File evidence and boundaries

`src/media-recovery.mjs` reads saved timeline records directly, so it can diagnose missing files without first compiling or decoding them. Asset-record identity and filename are validated, the assets directory must not be a symbolic link, and hashing uses a checked open descriptor. The scan compares file identity/size/timestamps before and after hashing and rechecks the path; observed changes are unassessed, not approved. Symlinks, dangling links, nonregular files and invalid records are not read as candidate media.

The default hash budget is 64 GiB per scan with a five-minute hash deadline and at most 1,000 scoped assets. Files outside the remaining budget are marked unassessed; they are never silently dropped or labeled verified. Empty scopes do not produce an “all verified” result. Files are checked sequentially, so this is timestamped evidence, not an atomic filesystem snapshot. It does not claim protection against a privileged local process or an adversarial filesystem racing every check.

Restore is limited to the existing 8 GiB per-file import ceiling. A conflict fingerprint binds the reviewed asset ID, SHA-256, stored name and byte length; this is an optimistic-conflict check, **not an authorization token**. Incoming bytes and the completed staged file are independently hashed. Existing destination files are not overwritten: an exact concurrent arrival is accepted as already present; a different arrival, record change, unsafe file type or directory change rejects installation. Interrupted uploads and failed checks remove private scratch files. A process can fail after installing the exact file but before writing a receipt; a retry safely reports already present. Power-loss durability and hostile cross-process filesystem races are not certified.

The HTTP routes share `mediaExclusive` with the existing local media operations. This serializes work inside the running process, not across multiple servers. Request disconnects propagate cancellation. The operation does not request any provider work, transcription, generation, normalization or paid service.

Not covered by a health pass: codec decodability, camera frame cadence, perceptual sync, display color, upstream originals of derivatives, old timeline history, unused library files, fonts/LUT dependencies, generated-output packages or native editor interchange. Existing render/delivery checks remain separate.

## Media delivery fixes

`src/media-stream.mjs` replaces the inline `/media/:id` reader while retaining the parent localhost, Host, Origin and cross-site protections.

- GET supports a single byte range, including suffix requests such as `bytes=-31`, open-ended ranges and clamped overlong end positions.
- Range numbers use BigInt until bounded by the real file length. Unsatisfiable ranges return 416 with the complete resource length.
- HEAD returns the full resource length and no body; Range is ignored for HEAD.
- Multipart, malformed or unknown-unit ranges are not implemented and are conservatively ignored with a full 200 response. If-Range also returns the full representation because this endpoint does not issue a strong validator.
- Media is read through a checked file descriptor with size and regular-file checks. Missing files return a controlled 404; structural integrity failures return 409. Disconnects destroy the read stream and errors do not become unhandled process exceptions.
- Cache policy is now `private, no-cache` rather than year-long immutable caching. This allows restored resources to be requested again. This response path checks metadata/size but **does not hash entire originals on every range request**; use Media health for full content verification. It does not certify browser playback or synchronization.

The deliberate unsupported-range policy follows the available HTTP range semantics rather than pretending to implement multipart responses. The endpoint is still single-user localhost infrastructure, not hosted tenant authentication.

## Files changed

New modules: `src/media-recovery.mjs`, `src/media-stream.mjs`, `public/media-health-room.js`, `public/media-health-room.css`.

Integration: `src/media-api.mjs`, `src/server.mjs`, `public/media-studio.js`, `public/media-studio.html`. The `public/timeline.js` guard is local-only and excluded from the published change set.

Verification: `test/media-recovery.test.mjs`, `test/media-stream.test.mjs`, `test/browser/media-health-dom.py`, plus actual-module loading in the existing `test/browser/music-dom.py`.

No new runtime dependency, provider adapter, font, binary, or copied third-party implementation is added.

## Verification

The final source-bound rerun passed **337 Node tests: 286 retained and 51 new**, with zero failures, cancellations or skipped tests. The published change set is recorded in the conversation package's `verification/all-tests-final.tap`; consult that log and `final-test-run.json` for results and the exact selected files. Tests use synthetic files, temporary databases and the parent HTTP server with unrelated provider/3D modules disabled by the existing test loader. The workspace is reconstructed from prior implementation packages, not a full checkout; the original provider/3D application suite is not included.

New cases exercise exact restoration after deletion, filename-independent matching, same-size wrong data, short/oversized uploads, cancellation, failed stream reads, corrupt existing files, concurrent destination arrival, record conflicts, symlinks and directory indirection, limited/incomplete scans, muted audio references, idempotency and reopening. A six-frame picture with a title and aligned source song is exported before and after deleting/restoring its source: independent FFmpeg frame hashes and aligned WAV hashes must match. HTTP tests rebuild an original from byte ranges and compare every byte, and exercise suffix/HEAD, safety gates and disconnect recovery.

Isolated UI checks use the actual modules with fake state/API and aborted networking. The published recovery component suite checks 18 behaviors including restore selection, stale/failed scans, late results, escaping and mobile containment. Together with the 94 rerun retained checks, 112 published-branch UI checks pass. A separate local-only fixture exercised the legacy guard before its upload was blocked; those three additional checks are not included in 112. Screenshots are explicitly synthetic interface fixtures, not proof of a real FX30 import.

An ordinary localhost Chromium navigation was attempted and returned `ERR_BLOCKED_BY_ADMINISTRATOR`. No policy change or bypass was attempted. Browser/server end-to-end operation, actual playback/seeking/synchronization, Windows filesystem behavior, actual FX30/a6300 recordings, native Resolve/FL Studio import and the complete original application remain release gates. The legacy format guard exists only in the separate local patch; the published branch leaves that file unchanged. Neither the proposed guard nor these checks qualify the entire older application.

### Reproduce in a complete checkout of this branch

Requires Node supporting `node:sqlite` and the existing FFmpeg/FFprobe dependencies. Environment used here: Node 22.16.0 and FFmpeg 7.1.5. The optional browser fixtures use Python Playwright with installed Chromium; they are not application runtime dependencies.

```sh
node --test --test-concurrency=2 test/media-recovery.test.mjs test/media-stream.test.mjs
python test/browser/media-health-dom.py
python test/browser/music-dom.py
```

Full scoped test selection is in `verification/final-test-run.json` in the conversation package. Running every test in a complete repository includes older provider/3D suites that were not available in this reconstruction.

## Primary references

Consulted 2026-09-11. Original implementation written for Shutter, not copied source.

- Node file-system API: https://nodejs.org/api/fs.html — file handles, open/lstat, link and synchronization. Code targets the tested Node 22 runtime, not newer documented-only APIs.
- RFC 9110: https://www.rfc-editor.org/rfc/rfc9110.html — HEAD, Range and If-Range semantics, especially sections 9.3.2, 13.1.5 and 14.

## Next release work

Run a normal browser/media end-to-end journey in an unrestricted development environment, then qualify representative Sony inputs and native-editor handoffs. A checksum match is useful evidence that a file is the same file; it is not evidence that the editor plays it correctly or that a grading handoff is production-ready.
