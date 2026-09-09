# Shutter current checkpoint

September 9, 2026. Active Codex task `01a087ae-15fc-7e43-8eb2-126e7883d103`. Original Lunari task `019fa76e-328b-7af3-ada3-bc3323b159db` is preserved in the recovery deliverable. The active user objective changed explicitly to standalone Shutter; do not resume Business work in place of it.

## Working result

Local application: `C:/dev/shutter`, `http://127.0.0.1:4677`. New code and original assets; no Lunari branch was modified or published. A private GitHub Shutter repository has not been created. The earlier GitHub inventory found no cinema-named/described repository among 132 listed repositories; that was a bounded inventory, not an exhaustive code search.

Implemented: durable productions in SQLite; immutable media; cast/place versions; editable shots and assigned references/cast; saved Moment drafts; exact prepared jobs; native first-image Wan binding; one local GPU job at a time; preserved provider IDs; uncertain submissions refused; decoded-output checks; chosen takes; reference-versus-take review; actual silent review-cut export; portable snapshot tooling; original Blender stage; optional local stdio MCP production bridge.

Built-in image generation produced a master and two reference-based close-ups for original adult characters Mira and Sol. The underlying image model variant is not exposed by the tool. No separately billed model API or fal credit was used. These are selected design candidates, not user-approved final cast designs.

## Three real video results

Production `prod_3ecfedf5-7026-4740-87ff-cef53a627ee7`, The last light. The original jobs all snapshot production revision 3. The working cut selects their exact IDs. Later selection/review revisions do not alter the original requests.

| Shot | Local job | Provider receipt | Wall time |
| --- | --- | --- | --- |
| The signal | `job_02c8cbf3-f6ce-4ff5-826c-68528d06f51c` | `8aacaeb4-6580-4e05-8bc5-357a01841d41` | 549.460 s |
| Mira listens | `job_9ea9fe65-ddf0-4c43-8038-aad3d4aa7380` | `ed38428b-57eb-4de3-b2d4-44460a3a2552` | 235.490 s |
| Sol understands | `job_94a18bcc-5183-464f-a989-5b546ea5a73f` | `664fa671-846f-41fc-bb04-dc52cf2d58c4` | 221.336 s |

Every returned file was decoded frame by frame: 768 × 512, 121 frames, 24 fps, 5.0416667 seconds. Twenty-step Wan 2.2 TI2V 5B through installed ComfyUI 0.33.1. The first job includes a cold model load; later sampling settled near 6.5–7.5 seconds/step. Timings are local job wall time including retrieval/verification, not marketing throughput or a promise about other models.

Observed device: RTX 3080 10 GB, about 32 GB RAM. A sampled memory reading during the first run was 8,659 MiB GPU and 12.29 GiB process working set. These are samples, not recorded peaks. Existing model filenames and file sizes were inspected; model binary hashes were not freshly recomputed during this turn. The graph and exact reference bytes were retained with each job.

The three selected files were assembled through the app into `cut_283805181fe913fa257232631149b4cec2d137bfdf4f67dd2c8946d6e42b7a2b`. Its decoded output is 363 frames / 24 fps / 15.125 seconds, SHA-256 `f9d4bca15422942509ee02f9e553f24d2a1257253e6f76967a3d0830e11fff78`. It is a silent review cut with no completed sound mix or continuity approval.

Visual inspection covered the master/reference images and video frames 0, 60 and 120 for each shot. Cast, wardrobe and prominent set/light cues remain recognizable across those samples. This does not establish drift-free faces throughout playback, exact performance timing, all-frame geometry or episode continuity. Review records retain these limitations. Never promote the study to a zero-drift or full-performance pass from these samples.

## Blender and MCP

Blender 5.2.1 was already installed; the attempted package-manager install correctly reported it was current. The actual executable version was verified. The original procedural observatory has three cameras, color-coded actor proxies, a central console/orb and an identified set. It generated RGB, depth/normal/object-index passes and `observatory.blend` in `data/stages/observatory-v1-rendered`. Scene generation/rendering took 5.17 seconds. An initial 5.2 output-format API mismatch was diagnosed from local RNA and corrected. The earlier incomplete directory was preserved.

Shutter's Stage page serves these real files. The Wan jobs used the original AI reference images, not the Blender renders. Full motion/depth conditioning and interactive camera editing are not implemented.

The optional `src/mcp.mjs` bridge negotiates stdio MCP and exposes eight bounded production/inspection tools through the actual app HTTP service. Its subprocess test verifies a saved edit, duplicate-safe preparation and stale-revision rejection. No global client configuration changed; no live Claude connection or interactive Blender MCP control was claimed.

## Holds and next useful milestone

Final code verification at this milestone: all 13 Node tests passed, including the stdio MCP subprocess path; browser script syntax passed. The browser exercised Moment draft reload and save, cast version editing, shot save/preparation, take selection, review recording and actual review-cut export. The first video reached browser readyState 4 with no media error. Source/media backup is verified separately by reopening the copied SQLite database and checking actual asset digests.

The user explicitly approved retrying the previously blocked ComfyUI startup and running the three local shots. The renderer then started and all three jobs completed. That startup hold is resolved; do not keep asking for the same approval or claim it remains blocked.

The user prefers a local model closer to Seedance 2.0/Kling 3 and specifically identifies MiniMax H3. Ref2VA is the intended multimodal target. The current H3 license excludes US/EU/UK/South Korea absent another grant; the actual intended deployment's authorization needs resolution. No H3 weights downloaded. A primary low-memory experiment keeps technical feasibility open, but it used newer hardware/Linux and does not qualify this Windows/Ampere machine. Do not dismiss H3 solely by raw parameter count or copy its performance numbers.

LTX-2.x's current license restricts competing products without a separate license. It was researched but not adopted. Source and license details are in `THIRD_PARTY.md` and `docs/2026-09-09-research.md`.

Next: resolve H3 deployment rights, qualify one real Ref2VA image-plus-motion-reference run on this host, then add audio references. Keep first/last-frame control distinct from omni-reference input. Build typed motion/voice/appearance bindings, compare actual output to the Blender path, and qualify a 30–60-second scene before a long episode. Professional timeline/sound, character turnaround authoring, full fidelity review and migration remain open.

No purchases, paid generation, public publication, customer migration or external messages were performed. Preserve the original Lunari experimental files and branches. No subagents were used.
