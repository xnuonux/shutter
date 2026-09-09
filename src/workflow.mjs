import fs from "node:fs";
const template = JSON.parse(
  fs.readFileSync(new URL("../workflows/wan22.json", import.meta.url), "utf8"),
);
export function compileWan(job, inputFilename) {
  const { shot, style, cast, place } = job.snapshot;
  const { width, height, frames, fps, seed } = shot;
  if (
    !Number.isInteger(width) ||
    width % 32 ||
    width < 256 ||
    width > 1024 ||
    !Number.isInteger(height) ||
    height % 32 ||
    height < 256 ||
    height > 768 ||
    !Number.isInteger(frames) ||
    frames < 5 ||
    frames > 241 ||
    (frames - 1) % 4 ||
    fps !== 24 ||
    !Number.isSafeInteger(seed) ||
    seed < 0
  )
    throw new Error("unsupported_profile");
  if (
    typeof inputFilename !== "string" ||
    !inputFilename ||
    inputFilename.includes("..") ||
    inputFilename.includes("\\") ||
    inputFilename.startsWith("/")
  )
    throw new Error("invalid_input_reference");
  const graph = structuredClone(template);
  graph["90"] = { class_type: "LoadImage", inputs: { image: inputFilename } };
  graph["55"].inputs = {
    ...graph["55"].inputs,
    width,
    height,
    length: frames,
    start_image: ["90", 0],
  };
  graph["3"].inputs.seed = seed;
  graph["57"].inputs.fps = fps;
  graph["6"].inputs.text = [
    style,
    shot.action,
    "Camera: " + shot.camera,
    "Characters: " +
      cast
        .map((c) => [c.name, c.description].filter(Boolean).join(", "))
        .join("; "),
    "Place: " + [place.name, place.description].filter(Boolean).join(", "),
    "Starting story state: " + (shot.before || ""),
    "Ending story state: " + (shot.after || ""),
    "Preserve the reference character faces, clothes, set geography and lighting. One continuous shot, no cut, no new characters, no text.",
  ]
    .filter(Boolean)
    .join("\n");
  graph["7"].inputs.text =
    "face morphing, identity change, costume change, new accessories, duplicate people, disappearing people, extra fingers, deformed hands, moving walls, changing architecture, text, subtitles, watermark, camera cut, flickering, low quality, blurry faces";
  graph["58"].inputs.filename_prefix = "shutter/" + job.id;
  return graph;
}
