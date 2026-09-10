/** Optional local stdio MCP bridge. No independent database or renderer queue.
 * Protocol: JSON-RPC, newline-delimited stdio, MCP 2025-06-18.
 * Only the listed production commands are exposed; no shell or arbitrary Python tool.
 */
import { createInterface } from "node:readline";
const base = process.env.SHUTTER_URL || "http://127.0.0.1:4677";
const address = new URL(base);
if (
  address.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(address.hostname)
)
  throw new Error("Local Shutter URL required");
const id = { type: "string", minLength: 1, maxLength: 200 };
const object = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const definitions = [
  ['shutter_get_timeline','Read the same saved scene timeline and exact source ranges as the visual editor. Coverage replaces picture without adding time; audio follows main footage.',object({projectId:id},['projectId']),true],
  ['shutter_save_timeline','Save a reversible edit to the observed timeline revision. Use integer source frames, stable clip IDs and ready takes. Does not generate video or spend credits. Read the timeline again on conflict.',object({projectId:id,baseRevision:{type:'integer',minimum:0},timeline:{type:'object'}},['projectId','baseRevision','timeline']),false],
  [
    "shutter_list_productions",
    "List local productions without loading their full take histories.",
    object({}),
    true,
  ],
  [
    "shutter_get_production",
    "Read the saved cast, place, shot sequence and exact chosen take IDs.",
    object({ projectId: id }, ["projectId"]),
    true,
  ],
  [
    "shutter_list_assets",
    "List local reference and video asset IDs. Does not upload files anywhere.",
    object({}),
    true,
  ],
  [
    "shutter_get_stage",
    "Read the existing Blender cameras, blocking reference IDs and downloadable scene files for a production.",
    object({ projectId: id }, ["projectId"]),
    true,
  ],
  [
    "shutter_update_shot",
    "Save a shot edit using the observed production revision. A stale revision is rejected. References must be existing local asset IDs.",
    object(
      {
        projectId: id,
        shotId: id,
        baseRevision: { type: "integer", minimum: 1 },
        changes: { type: "object" },
      },
      ["projectId", "shotId", "baseRevision", "changes"],
    ),
    false,
  ],
  [
    "shutter_prepare_shot",
    "Snapshot and save an exact shot request without generating. Reuse the same requestKey after an uncertain response; changed inputs conflict.",
    object({ projectId: id, shotId: id, requestKey: id }, [
      "projectId",
      "shotId",
      "requestKey",
    ]),
    false,
  ],
  [
    "shutter_render_shot",
      "Submit to the saved renderer: local Wan or paid H3 Max on fal. Requires generation authorization. Inspect the paid quote and budget first. Unknown outcomes cannot be resubmitted. Does not start ComfyUI.",
    object({ jobId: id }, ["jobId"]),
    false,
  ],
  [
    "shutter_get_job",
    "Read a saved render request and its actual state, retained provider receipt, media and review.",
    object({ jobId: id }, ["jobId"]),
    true,
  ],
];
const tools = definitions.map(
  ([name, description, inputSchema, readOnlyHint]) => ({
    name,
    description,
    inputSchema,
    annotations: {
      readOnlyHint,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }),
);
async function api(route, body, method = "POST") {
  const response = await fetch(base + route, {
    method: body ? method : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(100000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Shutter request failed");
  return result;
}
function validate(schema, value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Arguments must be an object.");
  for (const key of schema.required)
    if (value[key] === undefined) throw new Error("Missing argument: " + key);
  for (const [key, v] of Object.entries(value)) {
    const rule = schema.properties[key];
    if (!rule) throw new Error("Unknown argument: " + key);
    if (
      rule.type === "string" &&
      (typeof v !== "string" || !v.length || v.length > rule.maxLength)
    )
      throw new Error("Invalid " + key);
    if (
      rule.type === "integer" &&
      (!Number.isSafeInteger(v) || v < rule.minimum)
    )
      throw new Error("Invalid " + key);
    if (
      rule.type === "object" &&
      (!v || typeof v !== "object" || Array.isArray(v))
    )
      throw new Error("Invalid " + key);
  }
}
async function invoke(name, args) {
  const definition = tools.find((t) => t.name === name);
  if (!definition) throw new Error("Unknown tool.");
  validate(definition.inputSchema, args);
  if(name==='shutter_get_timeline'||name==='shutter_save_timeline'){
    const route='/api/productions/'+encodeURIComponent(args.projectId)+'/timeline';
    const result=await (name==='shutter_get_timeline'?api(route):api(route,{baseRevision:args.baseRevision,timeline:args.timeline},'PUT'));
    const {past,future,...current}=result;return {...current,canUndo:past.length>0,canRedo:future.length>0};
  }
  if (name === "shutter_prepare_shot") return api("/api/jobs", args);
  if (name === "shutter_render_shot")
    return api("/api/jobs/" + encodeURIComponent(args.jobId) + "/run", {});
  const state = await api("/api/state");
  if (name === "shutter_list_productions")
    return {
      productions: state.productions.map((p) => ({
        id: p.id,
        title: p.title,
        revision: p.revision,
        shots: p.shots.length,
      })),
      renderer: state.renderer.online ? "online" : "offline",
    };
  if (name === "shutter_list_assets") return { assets: state.assets };
  if (name === "shutter_get_job") {
    const job = state.jobs.find((j) => j.id === args.jobId);
    if (!job) throw new Error("not_found");
    return job;
  }
  const p = state.productions.find((p) => p.id === args.projectId);
  if (!p) throw new Error("not_found");
  if (name === "shutter_get_production") return p;
  if (name === "shutter_get_stage")
    return {
      stages: (state.stages || [])
        .filter((s) => s.projectId === p.id)
        .map((s) => ({
          ...s,
          downloads: s.files.map((file) => ({
            file,
            url: base + "/stage-files/" + s.id + "/" + file,
          })),
        })),
    };
  if (name === "shutter_update_shot") {
    const allowed = new Set([
      "title",
      "action",
      "camera",
      "reference",
      "cast",
      "frames",
      "fps",
      "width",
      "height",
      "seed",
      "before",
      "after",
    ]);
    if (Object.keys(args.changes).some((k) => !allowed.has(k)))
      throw new Error("Unsupported shot field.");
    if (!p.shots.some((s) => s.id === args.shotId))
      throw new Error("shot_not_found");
    return api(
      "/api/productions/" + p.id,
      {
        ...p,
        baseRevision: args.baseRevision,
        shots: p.shots.map((s) =>
          s.id === args.shotId ? { ...s, ...args.changes } : s,
        ),
      },
      "PUT",
    );
  }
  throw new Error("Unknown tool.");
}
let initialized = false;
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
async function receive(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
  }
  if (message?.id === undefined) return; // Notifications have no response.
  const reply = (result) => send({ jsonrpc: "2.0", id: message.id, result });
  const error = (code, text) =>
    send({ jsonrpc: "2.0", id: message.id, error: { code, message: text } });
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string")
    return error(-32600, "Invalid request");
  if (message.method === "initialize") {
    initialized = true;
    return reply({
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "shutter-local", version: "0.1.0" },
      instructions:
        "Use exact local asset and job IDs. A decoded take is not continuity approval. Never invent a render result or repeat an unknown submission. This server does not start the local renderer.",
    });
  }
  if (message.method === "ping") return reply({});
  if (!initialized) return error(-32002, "Initialize first");
  if (message.method === "tools/list") return reply({ tools });
  if (message.method === "tools/call") {
    try {
      const result = await invoke(
        message.params?.name,
        message.params?.arguments || {},
      );
      return reply({
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      });
    } catch (e) {
      return reply({
        isError: true,
        content: [{ type: "text", text: e.message }],
      });
    }
  }
  return error(-32601, "Method not found");
}
let pending = Promise.resolve();
createInterface({ input: process.stdin, crlfDelay: Infinity }).on(
  "line",
  (line) => {
    if (Buffer.byteLength(line) > 2 * 1024 * 1024) {
      process.stderr.write("MCP input exceeded the local request limit.\n");
      return;
    }
    pending = pending
      .then(() => receive(line))
      .catch((e) => process.stderr.write(e.message + "\n"));
  },
);
