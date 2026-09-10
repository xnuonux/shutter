import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Studio } from "../src/store.mjs";
import { compileWan } from "../src/workflow.mjs";

// These tests catch silently changed reference bytes, overwritten revisions,
// duplicate generation requests and a missing image at the real Wan input.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VZkAAAAASUVORK5CYII=",
  "base64",
);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shutter-test-"));
  const studio = new Studio(root);
  t.after(() => {
    studio.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const asset = studio.importAsset(png, {
    name: "mira.png",
    kind: "image",
    origin: "synthetic test",
  });
  const project = studio.createProduction({
    title: "The last light",
    style: "painted animation",
    cast: [{ id: "mira", name: "Mira", reference: asset.id }],
    place: { name: "observatory", reference: asset.id },
    shots: [
      {
        id: "wide",
        title: "The signal",
        action: "The orb pulses.",
        reference: asset.id,
        cast: ["mira"],
        duration: 5,
        frames: 121,
        fps: 24,
        width: 768,
        height: 512,
        seed: 17,
        camera: "locked eye-level two-shot",
      },
    ],
  });
  return { studio, asset, project };
}
test("stale editor cannot overwrite a newer saved production", (t) => {
  const { studio, project } = fixture(t);
  studio.saveProduction(project.id, 1, { ...project, title: "revised" });
  assert.throws(
    () => studio.saveProduction(project.id, 1, { ...project, title: "stale" }),
    /revision_conflict/,
  );
  assert.equal(studio.getProduction(project.id).title, "revised");
});
test("prepared job retains the exact cast, set and action after later edits and reopening", (t) => {
  const { studio, project } = fixture(t);
  const job = studio.prepareJob(project.id, "wide", "one");
  studio.saveProduction(project.id, 1, {
    ...project,
    style: "a different style",
    shots: [{ ...project.shots[0], action: "changed" }],
  });
  assert.equal(studio.getJob(job.id).snapshot.style, "painted animation");
  assert.equal(studio.getJob(job.id).snapshot.shot.action, "The orb pulses.");
  assert.equal(studio.getJob(job.id).snapshot.references.length, 1);
  assert.equal(studio.getJob(job.id).state, "prepared");
  const reopened = new Studio(studio.root);
  try {
    assert.deepEqual(reopened.getJob(job.id), studio.getJob(job.id));
    assert.equal(reopened.getProduction(project.id).revision, 2);
  } finally {
    reopened.close();
  }
});

test("a missing cast identity cannot silently disappear from a shot request", (t) => {
  const { studio, project } = fixture(t);
  assert.throws(
    () =>
      studio.saveProduction(project.id, 1, {
        ...project,
        shots: [{ ...project.shots[0], cast: ["missing"] }],
      }),
    /cast_reference_missing/,
  );
});

test("a cut selects an exact ready take and keeps it when another take is prepared", (t) => {
  const { studio, project } = fixture(t);
  const first = studio.prepareJob(project.id, "wide", "take-a");
  assert.throws(
    () => studio.selectTake(project.id, 1, "wide", first.id),
    /ready_take_required/,
  );
  const video = studio.importAsset(
    Buffer.from([
      0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0,
    ]),
  );
  studio.updateJob(first.id, { state: "ready", output: video.id });
  studio.selectTake(project.id, 1, "wide", first.id);
  studio.prepareJob(project.id, "wide", "take-b");
  assert.equal(
    studio.exportProduction(project.id).production.shots[0].selectedTake,
    first.id,
  );
  const saved = studio.getProduction(project.id);
  studio.saveProduction(saved.id, saved.revision, {
    ...saved,
    shots: [{ ...saved.shots[0], frames: 145 }],
  });
  assert.equal(studio.buildCutPlan(saved.id).frames, 121);
  assert.equal(studio.buildCutPlan(saved.id).takes[0].jobId, first.id);
});
test("retry returns the same job and a changed request conflicts", (t) => {
  const { studio, project } = fixture(t);
  const first = studio.prepareJob(project.id, "wide", "retry-key");
  assert.equal(studio.prepareJob(project.id, "wide", "retry-key").id, first.id);
  studio.saveProduction(project.id, 1, {
    ...project,
    shots: [{ ...project.shots[0], action: "changed" }],
  });
  assert.throws(
    () => studio.prepareJob(project.id, "wide", "retry-key"),
    /request_conflict/,
  );
});
test("missing or modified source bytes cannot become a prepared shot", (t) => {
  const { studio, asset, project } = fixture(t);
  fs.writeFileSync(studio.assetPath(asset.id), "corrupt");
  assert.throws(
    () => studio.prepareJob(project.id, "wide", "bad"),
    /asset_integrity/,
  );
  assert.equal(studio.listJobs().length, 0);
});
test("native workflow receives the selected input image and supported settings", (t) => {
  const { studio, project } = fixture(t);
  const job = studio.prepareJob(project.id, "wide", "graph");
  const graph = compileWan(job, "shutter/reference.png");
  assert.deepEqual(graph["55"].inputs.start_image, ["90", 0]);
  assert.equal(graph["90"].inputs.image, "shutter/reference.png");
  assert.equal(graph["55"].inputs.length, 121);
  assert.equal(graph["3"].inputs.seed, 17);
  assert.match(graph["6"].inputs.text, /The orb pulses/);
  assert.match(graph["6"].inputs.text, /painted animation/);
  assert.throws(
    () =>
      compileWan(
        {
          ...job,
          snapshot: {
            ...job.snapshot,
            shot: { ...job.snapshot.shot, width: 773 },
          },
        },
        "x.png",
      ),
    /unsupported_profile/,
  );
});
test('reusing a ready take preserves provenance without carrying a second charge',t=>{
 const {studio,project}=fixture(t);const source=studio.prepareJob(project.id,'wide','original');const asset=studio.importAsset(Buffer.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]));
 const target=studio.createProduction({...project,id:undefined,title:'New cut'});
 assert.throws(()=>studio.reuseTake(target.id,1,'wide',source.id),/ready_take_required/);
 studio.updateJob(source.id,{state:'ready',output:asset.id,charge:{actualUsd:.25},providerId:'paid-once',media:{width:832,height:480,frames:124,fps:24}});
 const reused=studio.reuseTake(target.id,1,'wide',source.id);
 assert.equal(reused.sourceJobId,source.id);assert.equal(reused.output,asset.id);assert.equal(reused.charge,undefined);assert.equal(reused.providerId,null);
 assert.equal(studio.getProduction(target.id).shots[0].selectedTake,reused.id);
 assert.equal(studio.getJob(source.id).charge.actualUsd,.25);
 assert.throws(()=>studio.reuseTake(target.id,1,'wide',source.id),/revision_conflict/);
});
