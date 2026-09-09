import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Studio } from "../src/store.mjs";
import { createServer } from "../src/server.mjs";
test("visible HTTP commands preserve revisions and refuse cross-site writes", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shutter-api-")),
    studio = new Studio(root);
  const renderer = {
    health: async () => ({ online: false }),
    reconcile: async (id) => studio.getJob(id),
  };
  const server = createServer({ studio, renderer });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  t.after(async () => {
    await new Promise((r) => server.close(r));
    studio.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  let res = await fetch(base + "/api/productions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://foreign.example",
    },
    body: JSON.stringify({ title: "injected", shots: [] }),
  });
  assert.equal(res.status, 403);
  res = await fetch(base + "/api/productions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "local film", shots: [] }),
  });
  assert.equal(res.status, 201);
  const p = await res.json();
  res = await fetch(base + "/api/productions/" + p.id, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...p, title: "saved", baseRevision: 1 }),
  });
  assert.equal(res.status, 200);
  res = await fetch(base + "/api/productions/" + p.id, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...p, title: "stale", baseRevision: 1 }),
  });
  assert.equal(res.status, 409);
  const state = await (await fetch(base + "/api/state")).json();
  assert.equal(state.productions[0].title, "saved");
  assert.equal(state.renderer.online, false);
  assert.match(await (await fetch(base + "/")).text(), /Shutter/);
});
