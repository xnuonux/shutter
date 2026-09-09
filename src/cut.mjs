import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { probeVideo } from "./renderer.mjs";
const execute = promisify(execFile),
  inflight = new Map();
export async function exportCut(studio, projectId) {
  const plan = studio.buildCutPlan(projectId),
    id = "cut_" + plan.hash;
  try {
    const previous = studio.read(id, "cut");
    studio.verifyAsset(previous.output);
    return previous;
  } catch (e) {
    if (e.message !== "not_found") throw e;
  }
  if (inflight.has(id)) return inflight.get(id);
  const work = (async () => {
    const folder = path.join(studio.root, "cuts", id);
    fs.mkdirSync(folder, { recursive: true });
    const spec = {
      ...plan,
      inputs: plan.takes.map((t) => studio.assetPath(t.assetId)),
      output: path.join(folder, "review-cut.mp4"),
    };
    const filename = path.join(folder, "spec.json");
    fs.writeFileSync(filename, JSON.stringify(spec, null, 2));
    const python =
      process.env.SHUTTER_PROBE_PYTHON ||
      "D:/LunariRender/runtime/comfy/ComfyUI_windows_portable/python_embeded/python.exe";
    await execute(
      python,
      [
        "-s",
        fileURLToPath(new URL("../tools/assemble_cut.py", import.meta.url)),
        filename,
      ],
      { windowsHide: true, timeout: 600000, maxBuffer: 100000 },
    );
    const media = await probeVideo(spec.output);
    if (
      !media.decoded ||
      media.frames !== plan.frames ||
      media.width !== plan.width ||
      media.height !== plan.height ||
      media.fps !== plan.fps
    )
      throw new Error("cut_verification_failed");
    const asset = studio.importAsset(fs.readFileSync(spec.output), {
      name: plan.title + " - review cut.mp4",
      origin:
        "Shutter review cut. Exact chosen takes: " +
        plan.takes.map((t) => t.jobId).join(", "),
    });
    return studio.write("cut", {
      id,
      projectId,
      title: plan.title,
      plan,
      media,
      output: asset.id,
      createdAt: new Date().toISOString(),
      purpose: "review",
    });
  })();
  inflight.set(id, work);
  try {
    return await work;
  } finally {
    inflight.delete(id);
  }
}
