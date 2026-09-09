import fs from "node:fs";
import { Studio } from "../src/store.mjs";
const studio = new Studio(
  new URL("../data/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
);
try {
  if (studio.list("production").length) {
    console.log("Existing studio preserved; seed skipped.");
    process.exitCode = 0;
  } else {
    const refs = [
      "exec-9d559f00-e2c1-434b-b419-3561b8f3d831.png",
      "exec-ee7bfc1d-da22-45dc-a80c-447c229f5c21.png",
      "exec-7e461cfb-c949-415e-a283-c7edde4b6c34.png",
    ].map((name, i) =>
      studio.importAsset(
        fs.readFileSync(
          "C:/Users/Dom/.codex/generated_images/01a087ae-15fc-7e43-8eb2-126e7883d103/" +
            name,
        ),
        {
          name:
            ["Observatory master", "Mira close-up", "Sol reverse"][i] + ".png",
          origin:
            "Built-in Codex image generation, September 9, 2026. Original fictional cast. Subsequent angles use the master as reference. Underlying model variant not exposed by the tool.",
        },
      ),
    );
    const profile = { width: 768, height: 512, frames: 121, fps: 24 };
    const p = studio.createProduction({
      title: "The last light",
      subtitle: "An original animated short / continuity study",
      style:
        "Sculpted painterly 3D animation; hand-painted materials, muted teal and indigo, warm amber practical light, cool violet mountain twilight. Expressive original adult characters. Keep a restrained, cinematic performance.",
      cast: [
        {
          id: "mira",
          name: "Mira",
          version: 1,
          reference: refs[1].id,
          description:
            "An observatory mechanic with warm brown skin, short asymmetric dark curls, eyebrow scar, triangular brass earring, burnt-orange canvas jacket and deep teal scarf.",
          cues: "Hair silhouette, eyebrow scar, single earring, jacket seams and scarf color. Compare each angle with the master; the generated scar and earring laterality still needs explicit review.",
        },
        {
          id: "sol",
          name: "Sol",
          version: 1,
          reference: refs[2].id,
          description:
            "An older astronomer with olive skin, swept-back silver hair tied low, short silver beard, round brass spectacles, indigo wool coat, circular brass clasp and moss-green waistcoat.",
          cues: "Spectacle shape, nose and beard silhouette, tied-back hair, coat clasp and waistcoat pattern.",
        },
      ],
      place: {
        name: "The mountain observatory",
        version: 1,
        reference: refs[0].id,
        description:
          "Circular stone room. Teal round door to Mira’s side, three-section arched copper window to Sol’s side, central brass console, hanging armillary rings, dark green tiled floor. Amber orb at center, violet mountains outside.",
        cues: "Door/window relationship, table scale, orb position, hanging rings and the warm/cool light direction. Image references alone do not prove a consistent 3D floor plan.",
      },
      shots: [
        {
          ...profile,
          id: "signal",
          title: "The signal",
          reference: refs[0].id,
          cast: ["mira", "sol"],
          seed: 2026090901,
          camera:
            "Locked eye-level two-shot. Very slow push toward the brass console.",
          action:
            "The amber orb pulses once, gently lighting both faces. Mira and Sol hold their positions, breathe subtly and look at the orb. No speech. No camera cut.",
          before:
            "Mira stands left and Sol right. The orb rests on the console, glowing steadily.",
          after:
            "Both notice one brief pulse. Neither character nor prop changes position.",
        },
        {
          ...profile,
          id: "mira",
          title: "Mira listens",
          reference: refs[1].id,
          cast: ["mira"],
          seed: 2026090902,
          camera:
            "Static medium close-up. Mira looks slightly screen-right. Hold the conversation axis.",
          action:
            "Mira raises her eyes a little toward Sol, blinks once and breathes quietly. A faint amber light pulses across her face. Keep her face, hair, earring, scarf and the room unchanged. No speech.",
          before:
            "After the orb pulses, Mira is listening. She remains on the left side of the console.",
          after:
            "Mira meets Sol’s gaze. Her costume and expression remain restrained.",
        },
        {
          ...profile,
          id: "sol",
          title: "Sol understands",
          reference: refs[2].id,
          cast: ["sol"],
          seed: 2026090903,
          camera:
            "Static reverse medium close-up. Sol looks slightly screen-left. Hold the conversation axis.",
          action:
            "Sol looks toward Mira and gives one small, concerned nod. His glasses remain fixed. The amber orb glows at lower left and the mountains stay still. No speech, no camera cut.",
          before: "Sol remains to the right of the orb, looking toward Mira.",
          after:
            "Sol acknowledges the signal with a small nod. Nothing in the set moves.",
        },
      ],
    });
    console.log(
      JSON.stringify({
        projectId: p.id,
        shots: p.shots.length,
        assets: refs.length,
      }),
    );
  }
} finally {
  studio.close();
}
