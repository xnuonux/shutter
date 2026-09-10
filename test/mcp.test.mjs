import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { Studio } from "../src/store.mjs";
import { createServer } from "../src/server.mjs";

test("an agent can negotiate MCP, revise a real shot and prepare it idempotently through HTTP", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shutter-mcp-"));
  const studio = new Studio(root);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VZkAAAAASUVORK5CYII=",
    "base64",
  );
  const a = studio.importAsset(png);
  const p = studio.createProduction({
    title: "MCP scene",
    shots: [
      {
        id: "one",
        reference: a.id,
        frames: 121,
        fps: 24,
        width: 768,
        height: 512,
        seed: 1,
        action: "wait",
      },
    ],
  });
  const server = createServer({
    studio,
    renderer: {
      health: async () => ({ online: false }),
      reconcile: async (id) => studio.getJob(id),
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../src/mcp.mjs", import.meta.url))],
    {
      env: {
        ...process.env,
        SHUTTER_URL: "http://127.0.0.1:" + server.address().port,
      },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const pending = new Map();
  let sequence = 0;
  createInterface({ input: child.stdout }).on("line", (line) => {
    const result = JSON.parse(line);
    pending.get(result.id)?.(result);
    pending.delete(result.id);
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("MCP response timeout"));
      }, 5000);
      pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
      );
    });
  t.after(async () => {
    child.kill();
    await new Promise((r) => server.close(r));
    studio.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const init = await call("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  const listed = await call("tools/list");
  assert.ok(listed.result.tools.some((x) => x.name === "shutter_get_stage"));
  const updated = await call("tools/call", {
    name: "shutter_update_shot",
    arguments: {
      projectId: p.id,
      shotId: "one",
      baseRevision: 1,
      changes: { action: "look toward the window" },
    },
  });
  assert.equal(updated.result.isError, undefined);
  assert.equal(
    studio.getProduction(p.id).shots[0].action,
    "look toward the window",
  );
  const prepare = () =>
    call("tools/call", {
      name: "shutter_prepare_shot",
      arguments: {
        projectId: p.id,
        shotId: "one",
        requestKey: "agent-request",
      },
    });
  const first = await prepare(),
    second = await prepare();
  assert.equal(
    first.result.structuredContent.id,
    second.result.structuredContent.id,
  );
  assert.equal(studio.listJobs().length, 1);
  const bad = await call("tools/call", {
    name: "shutter_update_shot",
    arguments: {
      projectId: p.id,
      shotId: "one",
      baseRevision: 1,
      changes: { action: "stale" },
    },
  });
  assert.equal(bad.result.isError, true);
  assert.equal(studio.getProduction(p.id).revision, 2);
  const take=first.result.structuredContent;
  const video=studio.importAsset(Buffer.from('000000186674797000','hex'));
  studio.updateJob(take.id,{state:'ready',output:video.id,media:{frames:121,fps:24,width:768,height:512,audioStreams:0}});
  studio.selectTake(p.id,2,'one',take.id);
  const timeline=await call('tools/call',{name:'shutter_get_timeline',arguments:{projectId:p.id}});
  assert.equal(timeline.result.isError,undefined,'agent must read the same editing timeline as the UI');
  const edit=timeline.result.structuredContent.timeline;edit.main[0].sourceIn=24;
  const saved=await call('tools/call',{name:'shutter_save_timeline',arguments:{projectId:p.id,baseRevision:0,timeline:edit}});
  assert.equal(saved.result.isError,undefined);
  assert.equal(studio.buildCutPlan(p.id).frames,97);
  const stale=await call('tools/call',{name:'shutter_save_timeline',arguments:{projectId:p.id,baseRevision:0,timeline:edit}});
  assert.equal(stale.result.isError,true);assert.equal(studio.listJobs().length,1);
});
