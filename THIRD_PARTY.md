# Source and license record

Shutter's application code in this initial repository was written for Eternities. This repository is private working material; it does not grant a public software license. Third-party licenses remain in force for their respective components. No third-party model weights are redistributed here.

## Adopted in this build

| Material | Exact origin | Use and license |
| --- | --- | --- |
| Native Wan graph | Lunari scheduler `e33a8e8359b4f667bad5163462afab912b22c46c`, `local-render-node/workflows/wan22-ti2v-5b.json` | Copied as `workflows/wan22.json`. First-party donor flattened the MIT Comfy Org template below. Shutter adds a real LoadImage binding, changes prompts and binds the saved shot's settings at runtime. |
| Original Comfy template | Comfy-Org/workflow_templates `e3d92b9aae04644bc4e419de1676c233c168b9e5`, `templates/video_wan2_2_5B_ti2v.json` | MIT. Full notice retained in `licenses/comfy-workflow-templates-MIT.txt`. |
| Wan 2.2 TI2V 5B | [Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2), warehouse revision `42bf4cfaa384bc21833865abc2f9e6c0e67233dc` | Apache-2.0 model and upstream code. Existing installed model files are used through ComfyUI; source not copied into Shutter. |
| ComfyUI | Existing ComfyUI 0.33.1 under `D:/LunariRender/runtime/comfy` | External local runtime; Shutter communicates over HTTP. ComfyUI's GPL license applies to that runtime. No runtime files redistributed in the app archive. |
| Blender | Existing Blender 5.2.1 LTS, build `9e2066aef7ef` | GPL-3.0-or-later external application. The original procedural stage and output belong to this project; Blender itself is not bundled. |
| PyAV | Existing ComfyUI Python environment | Used to decode each frame of a returned video. A test with a controlled decoder does not constitute proof of real video decoding. |
| Generated references | Built-in Codex image generation on September 9, 2026 | Original fictional characters and environment. Master image followed by two edits using it as a reference. No external character, photograph or franchise was supplied. Tool does not expose its underlying model variant. No separately billed API invocation was made. |

## Inspected, not adopted

The sole warehouse is `D:/03-ARSENAL/warehouse`. Downloaded source is not automatically approved for reuse.

- **Lightricks/LTX-2**, warehouse revision `400fd31054597515f47125691032c04b1c3ee24e`: attractive audio/video and control capabilities, but the current LTX-2.x Community License includes a restriction on competing products without a separate license, in addition to commercial conditions. Not selected for Shutter's no-budget commercial direction. See [the current license](https://github.com/Lightricks/LTX-2/blob/main/LICENSE).
- **MiniMax-AI/MiniMax-H3**: the user's preferred local multimodal target. Ref2VA accepts image, video and audio context; open base checkpoints do not include the complete hosted Context-IR/2K service. The August 2 community license excludes US, EU, UK and South Korea absent another grant. No weights or restricted implementation were adopted. Hardware feasibility is an open experiment, not ruled out by raw parameter count. See [model code and specification](https://github.com/MiniMax-AI/MiniMax-H3) and [license](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE).
- **Tomiigo/minimax-h3-16gb**: research evidence only, no code or assets copied. Current README reports Ref2VA with an 8,188 MiB memory cap on a 16 GB RTX 5070 Ti, under 32 GB system memory on Linux. It explicitly does not validate Windows or Ampere. No timing is transferred to this RTX 3080.
- **ComfyUI-LTXVideo, ComfyUI-Montagen, IPAdapter Plus**: indexed as candidates; no code copied. IPAdapter image identity guidance is not evidence of stylized video identity preservation.
- **Blender MCP**: official Blender Lab and Higgsfield's add-on/bridge were researched. Neither add-on was installed or connected to external accounts. This build creates an original local scene through Blender's own Python interface. Shutter's own optional stdio MCP bridge exposes production commands and inspection of those stage references; interactive Blender manipulation is still future work.

## First-party inheritance

The design preserves Lunari Cinema's useful distinctions: a quick Moment, reference-to-video versus frame continuation, project/cast context and recoverable local artifacts. The standalone app does not copy the existing Cinema editor, change Pixel's identity or replace Lunari's timeline. Further adoption should use the canonical Godspec and current donor revisions, not stale defect lists.
