import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compileWan } from "./workflow.mjs";

export async function probeVideo(filename) {
  const python =
    process.env.SHUTTER_PROBE_PYTHON ||
    "D:/LunariRender/runtime/comfy/ComfyUI_windows_portable/python_embeded/python.exe";
  if (!fs.existsSync(python)) throw new Error("media_probe_unavailable");
  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [
        "-s",
        fileURLToPath(new URL("../tools/probe_video.py", import.meta.url)),
        filename,
      ],
      { windowsHide: true, shell: false },
    );
    let out = "",
      err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("media_probe_timeout"));
    }, 60000);
    child.stdout.on("data", (b) => {
      out += b.toString();
    });
    child.stderr.on("data", (b) => {
      err += b.toString().slice(0, 2000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(new Error("media_decode_failed: " + err.slice(-500)));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error("media_probe_invalid"));
      }
    });
  });
}
export class Renderer {
  constructor(
    studio,
    { baseUrl = "http://127.0.0.1:8188", probe = probeVideo } = {},
  ) {
    const u = new URL(baseUrl);
    if (
      u.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(u.hostname)
    )
      throw new Error("local_renderer_required");
    this.studio = studio;
    this.base = baseUrl;
    this.probe = probe;
    this.polling = new Set();
  }
  async request(endpoint, options = {}) {
    const response = await fetch(this.base + endpoint, {
      ...options,
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("comfy_http_" + response.status);
    return response;
  }
  async json(endpoint, options) {
    return (await this.request(endpoint, options)).json();
  }
  async health() {
    try {
      const stats = await this.json("/system_stats");
      return { online: true, name: "Wan 2.2 · local", stats };
    } catch {
      return {
        online: false,
        name: "Wan 2.2 · local",
        reason: "Local renderer is offline. Prepared work is saved.",
      };
    }
  }
  async submit(id) {
    let job = this.studio.getJob(id);
    if (job.providerId) return job;
    if (job.state === "unknown" || job.state === "submitting")
      throw new Error("submission_unknown");
    if (job.state !== "prepared") throw new Error("job_not_prepared");
    compileWan(job, "reference.png"); // Validate before touching provider.
    if (!(await this.health()).online) throw new Error("renderer_offline");
    const queue = await this.json("/queue");
    if (queue.queue_running?.length || queue.queue_pending?.length)
      throw new Error("renderer_busy");
    for (const ref of job.snapshot.references) this.studio.verifyAsset(ref.id);
    job = this.studio.claimJob(id);
    if (!job) return this.studio.getJob(id);
    let submitted = false;
    try {
      const ref = this.studio.verifyAsset(job.snapshot.shot.reference);
      const form = new FormData();
      form.append(
        "image",
        new Blob([fs.readFileSync(this.studio.assetPath(ref.id))], {
          type: ref.mime,
        }),
        ref.filename,
      );
      form.append("subfolder", "shutter");
      form.append("overwrite", "false");
      const upload = await this.json("/upload/image", {
        method: "POST",
        body: form,
      });
      const filename = [upload.subfolder, upload.name]
        .filter(Boolean)
        .join("/");
      const graph = compileWan(job, filename);
      this.studio.updateJob(id, {
        graph,
        graphPreparedAt: new Date().toISOString(),
      });
      submitted = true;
      const receipt = await this.json("/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: graph,
          client_id: job.id,
          extra_data: { shutter_job: id, spec_hash: job.specHash },
        }),
      });
      if (typeof receipt.prompt_id !== "string" || !receipt.prompt_id)
        throw new Error("missing_provider_receipt");
      return this.studio.updateJob(id, {
        state: "rendering",
        providerId: receipt.prompt_id,
        error: null,
      });
    } catch (e) {
      this.studio.updateJob(id, {
        state: submitted ? "unknown" : "prepared",
        error: e.message,
      });
      throw e;
    }
  }
  async reconcile(id) {
    let job = this.studio.getJob(id);
    if (!job.providerId || job.state === "ready" || job.state === "failed")
      return job;
    if (this.polling.has(id)) return job;
    this.polling.add(id);
    let completed = false,
      staging = null;
    try {
      const history = await this.json(
        "/history/" + encodeURIComponent(job.providerId),
      );
      const item = history[job.providerId];
      if (!item) return job;
      if (item.status?.status_str === "error")
        return this.studio.updateJob(id, {
          state: "failed",
          error: "The local model failed. Its provider record was retained.",
        });
      if (item.status?.completed !== true) return job;
      completed = true;
      const outputs = Object.values(item.outputs || {}).flatMap((v) => [
        ...(v.videos || []),
        ...(v.images || []),
        ...(v.gifs || []),
      ]);
      const artifact = outputs.find((a) => /\.mp4$/i.test(a.filename));
      if (!artifact) throw new Error("video_artifact_missing");
      if (
        artifact.type !== "output" ||
        artifact.filename.includes("/") ||
        artifact.filename.includes("\\") ||
        String(artifact.subfolder).includes("..")
      )
        throw new Error("invalid_provider_artifact");
      this.studio.updateJob(id, { state: "verifying" });
      const query = new URLSearchParams({
        filename: artifact.filename,
        subfolder: artifact.subfolder || "",
        type: "output",
      });
      const response = await this.request("/view?" + query);
      const chunks = [];
      let count = 0;
      for await (const chunk of response.body) {
        count += chunk.length;
        if (count > 256 * 1024 * 1024) throw new Error("video_too_large");
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      staging = path.join(this.studio.root, id + ".mp4");
      fs.writeFileSync(staging, bytes);
      const media = await this.probe(staging);
      const shot = job.snapshot.shot;
      if (
        !media.decoded ||
        media.width !== shot.width ||
        media.height !== shot.height ||
        media.frames !== shot.frames ||
        Math.abs(media.fps - shot.fps) > 0.01
      )
        throw new Error("video_profile_mismatch");
      const asset = this.studio.importAsset(bytes, {
        name: job.snapshot.shot.title + ".mp4",
        origin: "Local Wan 2.2; job " + id + "; provider " + job.providerId,
      });
      fs.rmSync(staging, { force: true });
      staging = null;
      return this.studio.updateJob(id, {
        state: "ready",
        output: asset.id,
        media,
        finishedAt: new Date().toISOString(),
        error: null,
        elapsedSeconds: (Date.now() - Date.parse(job.startedAt)) / 1000,
      });
    } catch (e) {
      return this.studio.updateJob(id, {
        state: completed ? "failed" : "rendering",
        error: e.message,
        ...(staging ? { failedCandidate: path.basename(staging) } : {}),
      });
    } finally {
      this.polling.delete(id);
    }
  }
}
