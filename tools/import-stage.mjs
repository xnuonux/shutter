import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Studio, digest } from "../src/store.mjs";
const studio = new Studio(fileURLToPath(new URL("../data/", import.meta.url)));
try {
  const folder = "observatory-v1-rendered",
    root = path.join(studio.root, "stages", folder);
  const source = JSON.parse(
    fs.readFileSync(path.join(root, "stage.json"), "utf8"),
  );
  const production = studio
    .list("production")
    .find((p) => p.title === "The last light");
  if (!production) throw new Error("production_missing");
  const views = source.cameras.map((c) => ({
    ...c,
    reference: studio.importAsset(fs.readFileSync(path.join(root, c.rgb)), {
      name: "Blender blocking / " + c.shotId + ".png",
      origin:
        "Original Shutter procedural stage. Blender " +
        source.blender +
        ". Geometric proxy, not AI footage.",
    }).id,
  }));
  const files = [
    "observatory.blend",
    "stage.json",
    ...source.cameras.map((c) => c.passes),
  ];
  for (const file of files)
    if (!fs.statSync(path.join(root, file)).size)
      throw new Error("stage_file_missing");
  const fileDigests = Object.fromEntries(
    files.map((file) => [file, digest(fs.readFileSync(path.join(root, file)))]),
  );
  const stage = studio.write("stage", {
    id: "stage_observatory_v1",
    projectId: production.id,
    name: source.name,
    version: 1,
    folder,
    views,
    files,
    fileDigests,
    blender: source.blender,
    elapsedSeconds: source.elapsedSeconds,
    createdAt: new Date().toISOString(),
  });
  console.log(JSON.stringify({ id: stage.id, views: views.length, files }));
} finally {
  studio.close();
}
