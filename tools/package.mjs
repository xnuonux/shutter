import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Studio, digest } from "../src/store.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
if (!process.argv[2]) throw new Error("Pass a new destination directory.");
const destination = path.resolve(process.argv[2]);
if (fs.existsSync(destination))
  throw new Error("Refusing to overwrite an existing package.");
fs.mkdirSync(destination, { recursive: true });
for (const name of [
  "src",
  "public",
  "test",
  "tools",
  "workflows",
  "licenses",
  "docs",
  "package.json",
  "mcp.example.json",
  "README.md",
  "THIRD_PARTY.md",
  ".gitignore",
])
  fs.cpSync(path.join(root, name), path.join(destination, name), {
    recursive: true,
  });
const studio = new Studio(path.join(root, "data"));
try {
  const targetData = path.join(destination, "data");
  fs.mkdirSync(targetData);
  studio.db
    .prepare("VACUUM INTO ?")
    .run(path.join(targetData, "studio.sqlite"));
  const snapshot = new Studio(targetData);
  try {
    fs.mkdirSync(path.join(targetData, "assets"), { recursive: true });
    for (const asset of snapshot.list("asset")) {
      studio.verifyAsset(asset.id);
      const output = path.join(targetData, "assets", asset.filename);
      fs.copyFileSync(studio.assetPath(asset.id), output);
      if (digest(fs.readFileSync(output)) !== asset.sha256)
        throw new Error("Backup asset differs: " + asset.name);
    }
    for (const stage of snapshot.list("stage")) {
      fs.cpSync(
        path.join(studio.root, "stages", stage.folder),
        path.join(targetData, "stages", stage.folder),
        { recursive: true },
      );
      for (const [name, hash] of Object.entries(stage.fileDigests || {}))
        if (
          digest(
            fs.readFileSync(
              path.join(targetData, "stages", stage.folder, name),
            ),
          ) !== hash
        )
          throw new Error("Stage backup differs: " + name);
    }
    fs.mkdirSync(path.join(destination, "productions"));
    for (const p of snapshot.list("production"))
      fs.writeFileSync(
        path.join(destination, "productions", p.id + ".json"),
        JSON.stringify(snapshot.exportProduction(p.id), null, 2),
      );
    const runFile = path.join(studio.root, "continuity-run.json");
    if (fs.existsSync(runFile))
      fs.copyFileSync(runFile, path.join(targetData, "continuity-run.json"));
    for (const asset of snapshot.list("asset")) snapshot.verifyAsset(asset.id);
    console.log(
      JSON.stringify({
        destination,
        productions: snapshot.list("production").length,
        jobs: snapshot.listJobs().length,
        assets: snapshot.list("asset").length,
        verified: true,
      }),
    );
  } finally {
    snapshot.close();
  }
} finally {
  studio.close();
}
