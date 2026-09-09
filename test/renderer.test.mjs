import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { Studio } from "../src/store.mjs";
import { Renderer } from "../src/renderer.mjs";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VZkAAAAASUVORK5CYII=",
  "base64",
);
async function setup(
  t,
  { offline = false, lost = false, badProfile = false } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shutter-render-"));
  const studio = new Studio(root);
  t.after(() => {
    studio.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const a = studio.importAsset(png, { name: "frame.png" });
  const p = studio.createProduction({
    title: "test",
    shots: [
      {
        id: "one",
        title: "one",
        reference: a.id,
        action: "look up",
        camera: "static",
        width: 768,
        height: 512,
        frames: 121,
        fps: 24,
        seed: 1,
      },
    ],
  });
  let submissions = 0,
    uploaded = false,
    submittedGraph;
  const upstream = http.createServer(async (req, res) => {
    let bytes = [];
    for await (const b of req) bytes.push(b);
    const body = Buffer.concat(bytes);
    res.setHeader("content-type", "application/json");
    if (req.url === "/system_stats") {
      res.statusCode = offline ? 503 : 200;
      return res.end("{}");
    }
    if (req.url === "/queue")
      return res.end('{"queue_running":[],"queue_pending":[]}');
    if (req.url === "/upload/image") {
      uploaded = body.includes(png);
      return res.end(
        '{"name":"frame.png","subfolder":"shutter","type":"input"}',
      );
    }
    if (req.url === "/prompt") {
      submissions++;
      submittedGraph = JSON.parse(body).prompt;
      if (lost) {
        res.destroy();
        return;
      }
      return res.end('{"prompt_id":"provider-one"}');
    }
    if (req.url === "/history/provider-one")
      return res.end(
        JSON.stringify({
          "provider-one": {
            status: { completed: true, status_str: "success" },
            outputs: {
              58: {
                videos: [
                  {
                    filename: "take.mp4",
                    subfolder: "shutter",
                    type: "output",
                  },
                ],
              },
            },
          },
        }),
      );
    if (req.url.startsWith("/view?")) {
      res.setHeader("content-type", "video/mp4");
      return res.end(
        Buffer.from([
          0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0,
        ]),
      );
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  t.after(() => upstream.close());
  let probes = 0;
  const renderer = new Renderer(studio, {
    baseUrl: `http://127.0.0.1:${upstream.address().port}`,
    probe: async () => {
      probes++;
      return {
        width: 768,
        height: 512,
        frames: badProfile ? 49 : 121,
        fps: 24,
        duration: 121 / 24,
        decoded: true,
      };
    },
  });
  return {
    studio,
    renderer,
    p,
    observed: () => ({ submissions, uploaded, submittedGraph, probes }),
  };
}
test("real HTTP caller uploads actual selected bytes, submits once and reconciles after reconnect", async (t) => {
  const { studio, renderer, p, observed } = await setup(t);
  const job = studio.prepareJob(p.id, "one", "a");
  await renderer.submit(job.id);
  await renderer.submit(job.id);
  assert.equal(observed().submissions, 1);
  assert.equal(observed().uploaded, true);
  assert.deepEqual(observed().submittedGraph["55"].inputs.start_image, [
    "90",
    0,
  ]);
  assert.equal(studio.getJob(job.id).providerId, "provider-one");
  const finished = await renderer.reconcile(job.id);
  assert.equal(finished.state, "ready");
  assert.equal(studio.read(finished.output, "asset").kind, "video");
  assert.equal(finished.media.decoded, true);
});
test("offline renderer leaves the exact job prepared and does not claim a launch", async (t) => {
  const { studio, renderer, p, observed } = await setup(t, { offline: true });
  const job = studio.prepareJob(p.id, "one", "b");
  await assert.rejects(renderer.submit(job.id), /renderer_offline/);
  assert.equal(studio.getJob(job.id).state, "prepared");
  assert.equal(observed().submissions, 0);
});
test("lost provider submission acknowledgement cannot silently submit again", async (t) => {
  const { studio, renderer, p, observed } = await setup(t, { lost: true });
  const job = studio.prepareJob(p.id, "one", "c");
  await assert.rejects(renderer.submit(job.id));
  assert.equal(studio.getJob(job.id).state, "unknown");
  await assert.rejects(renderer.submit(job.id), /submission_unknown/);
  assert.equal(observed().submissions, 1);
});

test("a decoded but incorrect video stops verification and preserves the failed candidate", async (t) => {
  const { studio, renderer, p, observed } = await setup(t, {
    badProfile: true,
  });
  const job = studio.prepareJob(p.id, "one", "bad-profile");
  await renderer.submit(job.id);
  const result = await renderer.reconcile(job.id);
  assert.equal(result.state, "failed");
  assert.equal(result.output, null);
  assert.match(result.error, /video_profile_mismatch/);
  assert.ok(result.failedCandidate);
  assert.ok(fs.existsSync(path.join(studio.root, result.failedCandidate)));
  await renderer.reconcile(job.id);
  assert.equal(observed().probes, 1);
});
