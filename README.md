# Shutter

A local production room for original animated stories. Keep a cast and a place, direct individual shots, preserve exact references, generate local takes and review continuity. Moment remains the quick path from one image to one directed shot.

This is the first working production slice, not a finished cinema platform. The current executing adapter is Wan 2.2 TI2V 5B. MiniMax H3 Ref2VA is the intended multimodal research target; its territorial license and this machine's performance still need resolution. A first-image Wan test does not qualify multi-reference video, audio or full camera control.

## Open the studio

Requires Node.js 24 or later. No package installation is needed for the app.

```powershell
cd C:/dev/shutter
npm start
```

Open `http://127.0.0.1:4677`. The packaged snapshot includes its SQLite journal and original assets in `data/`. If this directory is absent, the app opens an empty studio; import an image through Moment to begin. `npm run seed` is only for the original development machine's generated-image paths and preserves an existing studio.

The app binds to this machine only. It does not automatically launch a model, purchase credits or send requests to an online generator.

## Create and direct

- **Production:** select a shot, change its title, action, camera, duration, seed, reference and cast. Save before preparing a new request. Chosen takes remain tied to their exact video files.
- **Moment:** import a PNG/JPEG or use the current reference, add a direction and save. An unfinished Moment draft survives a browser reload. A saved Moment can grow by adding shots.
- **Cast / Places:** create and edit reference versions. Assign a character to a shot in Production. Earlier prepared jobs keep the previous reference version.
- **Renders:** inspect actual job state and retained provider receipts. Preparation is separate from generation. An uncertain submission is not automatically repeated.
- **Review:** compare the reference that produced a take with the returned video. Record face, costume, set, light, motion and story separately. A successfully decoded video is still a candidate until visually reviewed.
- **Stage:** inspect the original Blender blockout, download the `.blend`, camera/object layout and multilayer geometry passes. The figures are proxies, not final character likenesses.

“Play boards” plays still references as an animatic. “Play cut” requires a selected ready take for every shot. “Export review cut” produces and checks an actual MP4 from those chosen takes. This first exporter requires matching frame size/rate and silent source clips; it refuses to discard an existing soundtrack. A review cut is a working selection, not an assertion that its continuity has been approved. Export manifest downloads the asset and take record; the portable backup below includes the actual media and application.

## Local video runtime

The existing runtime is ComfyUI 0.33.1 at `D:/LunariRender/runtime/comfy/ComfyUI_windows_portable/ComfyUI`, serving `http://127.0.0.1:8188`. On the development machine it uses an RTX 3080 with 10 GB VRAM and approximately 32 GB system memory.

Required model filenames, already installed on the development machine:

```text
diffusion_models/wan2.2_ti2v_5B_fp16.safetensors
text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors
vae/wan2.2_vae.safetensors
```

The saved graph binds the actual selected PNG/JPEG to the native Wan start-image input. Cast and place reference metadata is retained; this adapter does not separately feed those additional images into a multi-reference model.

Media verification uses PyAV through the existing portable Python. On another machine, set `SHUTTER_PROBE_PYTHON` to a Python executable with `av` installed. `SHUTTER_DATA` can select a different studio directory. The app never installs missing dependencies automatically.

Once ComfyUI is online, render a prepared shot from the app. For the explicitly authorized three-shot experiment, `tools/run-continuity.mjs <production-id>` runs existing prepared jobs sequentially and stops on failure or uncertain submission. Its 30-minute observation limit does not cancel a provider job. Reconcile the existing receipt before taking further action.

## Optional MCP connection

`src/mcp.mjs` is a local stdio MCP server. `mcp.example.json` contains an example client configuration; no global Codex or Claude configuration was changed. Start the Shutter app first. An MCP client can list productions and assets, inspect cast and Blender camera metadata, revise a shot with an observed revision, prepare idempotently, submit an authorized local render and read the resulting job.

The bridge uses the same HTTP commands as the browser. It does not execute arbitrary code, start ComfyUI, modify an open Blender session or provide hosted model credits. Protocol negotiation and real saved edits/preparation are tested through a subprocess and the actual HTTP server. A live Claude connection has not been tested.

## Verification and backup

```powershell
npm test
node --check public/app.js
node tools/package.mjs <new-destination-directory>
```

The tests use real domain commands and a controlled HTTP renderer. They verify persistence, input binding, duplicate prevention and failure behavior; they do not measure generation quality. Real-run and visual observations belong in `docs/current-checkpoint.md` and the generated run record.

`tools/package.mjs` takes a consistent SQLite snapshot and copies source, assets and referenced stage files to a new directory. It refuses to overwrite an existing destination. It does not bundle model weights, ComfyUI, Blender or credentials.

The original Blender stage can be regenerated in a **new output directory** using Blender 5.2.1:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python-exit-code 1 --python tools/observatory_stage.py -- --output C:/dev/shutter/data/stages/new-stage
```

See `docs/2026-09-09-direction.md` for architecture, `docs/2026-09-09-research.md` for current product/model decisions, and `THIRD_PARTY.md` for source and license boundaries.
