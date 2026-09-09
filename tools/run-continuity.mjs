import fs from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
const base = "http://127.0.0.1:4677";
async function api(route, body) {
  const response = await fetch(base + route, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(100000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(result));
  return result;
}
const state = await api("/api/state");
const p = state.productions.find((p) => p.id === process.argv[2]);
if (!p) throw new Error("Pass the exact saved production ID.");
const report = {
  startedAt: new Date().toISOString(),
  projectId: p.id,
  productionRevision: p.revision,
  shots: [],
};
const output = new URL("../data/continuity-run.json", import.meta.url);
for (const shot of p.shots) {
  let job = state.jobs
    .filter((j) => j.projectId === p.id && j.shotId === shot.id)
    .at(-1);
  if (!job) throw new Error("Prepare every shot through the studio first.");
  if (job.state === "prepared") {
    job = await api("/api/jobs/" + job.id + "/run", {});
    console.log(
      JSON.stringify({
        shot: shot.title,
        jobId: job.id,
        providerId: job.providerId,
        state: job.state,
      }),
    );
  }
  const deadline = Date.now() + 30 * 60 * 1000;
  let lastState = job.state;
  while (!["ready", "failed", "unknown"].includes(job.state)) {
    if (Date.now() > deadline)
      throw new Error(
        "Observation limit reached. The saved provider job remains active; do not submit a duplicate.",
      );
    await delay(5000);
    const current = await api("/api/state");
    job = current.jobs.find((j) => j.id === job.id);
    if (job.state !== lastState) {
      lastState = job.state;
      console.log(
        JSON.stringify({
          shot: shot.title,
          state: job.state,
          error: job.error,
        }),
      );
    }
  }
  report.shots.push(job);
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  if (job.state !== "ready")
    throw new Error("Stopped on " + job.state + ": " + job.error);
  console.log(
    JSON.stringify({
      shot: shot.title,
      output: job.output,
      seconds: job.elapsedSeconds,
      media: job.media,
    }),
  );
}
report.finishedAt = new Date().toISOString();
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(
  "All three video files decoded successfully. Visual continuity still requires review.",
);
