# Shutter: a production with a memory

September 9, 2026. Owner: Dom / Eternities. Implementation starts in this isolated local repository. This task is authorized to research, build, install necessary free software and test locally. No paid API calls, purchases, publication or customer migration are authorized. Execute inline without subagents. The original Lunari Business branches remain untouched.

## Decision

Shutter becomes the standalone cinema product behind Pixel's future Lunari Cinema surface. Preserve Moment as the fast path from an image to a directed moving shot. A production adds cast, places, visual language, story state, shots, takes and editing around the same assets and jobs. Pixel retains his identity. Existing projects are not migrated during this slice.

The first observable result is a local three-shot stylized-animation production, with original characters, reference images, immutable shot specifications, recoverable local render jobs, side-by-side continuity review and a downloadable production package. Its generated videos must be identified separately from boards, animatics and Blender blocking. A 20-minute episode is a sequence of qualified shots, not a request for a model to remember 20 minutes of invented history.

## Evidence and choices

The Astra source is `C:/dev/eternities-canon/sources/astra-reconstruction-2026-09-07/03_PRODUCTS_01_09/expanded/batch_02_04/shutter/GODSPEC.md`, prepared September 6. Its sections 1, 6, 7, 17, 20 and 21 establish standalone scope, quick creation, immutable references, exports, local workers and one future timeline authority. Some historical Cinema defects in it were superseded by September 7 device-custody and portable-recovery work. Do not refix from old prose.

Frontend donor is `C:/dev/.worktrees/lunari-frontend-beta-local-v290@6767921`; backend donor is `C:/dev/.worktrees/lunari-scheduler-beta-rails-v288@e33a8e8`. Moment already distinguishes local rendering, and the backend distinguishes reference-to-video from last-frame chaining. Preserve those semantics. The current local workflow lacks a bound start image, despite the native Wan node supporting it; Shutter's Moment and shot compiler must bind the actual input bytes.

Machine observed: RTX 3080 10 GB, approximately 32 GB RAM, about 418 GiB free on D. Existing ComfyUI 0.33.1, FLUX.2 Klein 4B and Wan 2.2 TI2V 5B files and earlier render artifacts exist in D:/LunariRender. No re-download was needed for this baseline. An initial automatic-review startup rejection was subsequently resolved by the user's explicit confirmation. Three new videos have now rendered and decoded successfully; see `current-checkpoint.md` for exact timings and qualification limits.

Options compared:

| Option | What it buys | Limitation | Decision |
| --- | --- | --- | --- |
| One large prompt and sequential last-frame continuation | Fastest wiring | Compounds drift, weak cuts and no explicit story state | Reject as production authority; retain only as an explicit same-shot continuation option |
| Selected character/set references, explicit shot state and replaceable models | Stronger repeatability, local testability and independent takes | Image conditioning alone cannot guarantee identity or camera geometry | Implement first |
| Persistent Blender scene, controlled camera/pose/depth plus reference-conditioned generation | Exact blocking and measurable layout across angles | More setup; native model must actually support the chosen control modality | Add as the geometric control lane; do not describe first-frame I2V as full video-to-video control |

Wan 2.2 5B is the installed pipeline baseline, not a claim of 2026 frontier visual quality. MiniMax H3 Ref2VA is the user's preferred multimodal target. Its community license excludes US/EU/UK/South Korea absent separate authorization. A published 8 GB memory-cap / 32 GB system-memory experiment on newer hardware means raw parameter count does not rule it out; Windows/Ampere performance remains unmeasured. No H3 weights were downloaded in this slice. Current LTX-2.x licensing also restricts competing products, so it was not adopted. See the research record for these corrected decisions.

## Product and data contracts

- Local service owns a SQLite project/job journal and immutable content-addressed asset files. Bind to loopback only. Browser, CLI and future MCP use the same domain commands.
- Production owns revisions of cast, location and style, an ordered shot list, story-state before/after, and selected takes. A shot snapshots those versions when prepared. Later edits cannot alter the old request.
- Asset identity is a digest of actual bytes, plus original name, media kind, provenance and role. URLs are derived locators. A relink or edit creates a new version.
- Job preparation is durable and idempotent. Same request key with changed specification conflicts. Submission is separate from preparation. Preserve the local provider prompt ID; restart reconciles it rather than resubmitting. A transport timeout after submission is 'outcome unknown'.
- Local worker permits one GPU job at a time. Each shot declares dimensions, exact frames/fps, seed, model, workflow and reference digests. Unsupported settings are rejected before a launch.
- A take is ready only after bytes are retrieved and media is decoded/probed. Workflow completion alone is not visual approval. Review records face, costume, set, lighting, motion and story separately and can mark a take rejected or needing work.
- A cut selects exact ready takes in sequence. Draft boards are clearly identified as still images. Failed or missing shots cannot silently become a completed film.
- Moment uses the same asset/job path with one shot and no prerequisite world-building ceremony. Promotion to a production preserves source identity.

## First experiment

Original stylized short: The Last Light. Mira and Sol stand around an amber orb in a mountain observatory at twilight. Master two-shot, Mira close-up, Sol reverse. Selected stills are generated through the built-in image tool, with reference-preserving edits for subsequent angles. Keep those candidates and prompts. They are not proof of identity continuity in motion.

Compare each video's start/middle/end against its approved keyframe and the master reference. Record mismatches in face, hair, accessories, wardrobe, room geometry, orb state and light direction. No invented 'identity score'. Automatic image similarity is a warning signal only and is particularly weak for stylized faces. An independently generated text-only baseline is useful after the conditioned lane can actually render.

Initial profile: 768 x 512, 121 frames at 24 fps, 20 steps, one job at a time. If a measured resource failure requires a smaller profile, create a separate declared experiment. The user's five minutes per five seconds is tolerance, not measured throughput. At that rate, five minutes of footage takes roughly five hours and twenty minutes takes twenty hours before retries; short qualification must precede a long run.

## Interface direction

A quiet blue-charcoal editing room, soft slate panels, pearl text and a muted lavender selection color. The film image is the dominant visual. Segoe UI for controls; restrained Georgia for the production title. Left: production navigation and cast/place library. Center: large viewer with selected take/board identity. Right: directed action, source references and actual render state. Bottom: ordered shot strip. Review opens paired references and per-criterion notes. Moment keeps one image, one direction field and one render action. No storefront hero, decorative metrics, fake generation progress or unsupported model menu.

## Acceptance and boundaries

Tests exercise actual domain commands: immutable asset import, stale-revision rejection, snapshots unaffected by edits, changed bytes refused, idempotent job creation and out-of-order results attached to their own shots. Adapter tests inspect the submitted native graph and reference upload, not just a helper's constants. Browser verification must operate the visible app and test reload. Local videos need actual decoded media and visual inspection.

The first repository is a local production workbench and renderer adapter. Full professional NLE feature parity, 20-minute aesthetic continuity, voice performance, local LoRA training, cloud multi-user service and automatic migration remain future acceptance work. Preserve existing Cinema editor ancestry and its tested recovery rather than cloning a second mutable timeline into Lunari.
