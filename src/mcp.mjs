/** Optional local stdio MCP bridge. No independent database or renderer queue.
 * Protocol: JSON-RPC, newline-delimited stdio, MCP 2025-06-18.
 * Only the listed production commands are exposed; no shell or arbitrary Python tool.
 */
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import {ACTION_VERSION,validateSchema} from '../public/action-contract.mjs';
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
const actionInput={projectId:id,version:{const:ACTION_VERSION},baseRevision:{type:'integer',minimum:0},commands:{type:'array',minItems:1,maxItems:32,items:{type:'object'}}};
const definitions = [
  ['shutter_action_catalog','Discover Studio editing actions and effects. Omit types for compact summaries; supply action types for exact input schemas and examples. Read this before planning edits. No generation or spending.',object({types:{type:'array',maxItems:31,items:id}}),true],
  ['shutter_studio_context','Read Studio productions and a bounded page of local source metadata. With projectId, return the saved edit, exact scene/source ranges, revision, warnings and undo/redo availability. No media processing or provider calls.',object({projectId:id,assetOffset:{type:'integer',minimum:0},assetLimit:{type:'integer',minimum:1,maximum:100}}),true],
  ['shutter_preview_actions','Preview 1-32 ordered Studio actions against the observed revision without saving. Returns exact resulting timeline, visible source intervals, changed fields and previewHash. Discover command schemas first. Undo or redo must be standalone.',object(actionInput,Object.keys(actionInput)),true],
  ['shutter_apply_actions','Apply the exact previewed Studio batch as one reversible edit. Requires its unchanged version, revision, commands and previewHash plus a stable requestKey. Retry identical input with the same key after an uncertain response; changed input conflicts. Never claims creative continuity approval.',object({...actionInput,previewHash:{type:'string',pattern:'^[a-f0-9]{64}$'},requestKey:id},[...Object.keys(actionInput),'previewHash','requestKey']),false],
  ['shutter_action_receipt','Read the persisted outcome for a Studio action requestKey. revision is the original applied revision; currentRevision may be later. A missing receipt is not evidence of success.',object({projectId:id,requestKey:id},['projectId','requestKey']),true],
  ['shutter_inspect_cutaway','Inspect a previewed cutaway with up to six local source pictures and saved artist intent. Compares entry, return and main/alternate views at equal scene time. Returns JPEG images by default; set includeImages=false for metadata only. Local extraction caches evidence without editing, paid generation or continuity approval.',object({...actionInput,previewHash:{type:'string',pattern:'^[a-f0-9]{64}$'},coverageId:id,includeImages:{type:'boolean'}},[...Object.keys(actionInput),'previewHash','coverageId']),false],
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
      idempotentHint: readOnlyHint || ['shutter_prepare_shot','shutter_apply_actions','shutter_render_shot','shutter_inspect_cutaway'].includes(name),
      openWorldHint: ['shutter_prepare_shot','shutter_render_shot'].includes(name),
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
  return validateSchema(schema,value);
}
function recovery(code){
  if(['revision_conflict','action_preview_conflict','evidence_intent_conflict'].includes(code))return 'Read shutter_studio_context again and preview against the current revision before applying.';
  if(code==='action_request_conflict')return 'Read shutter_action_receipt for that key. Use a new key only for a deliberately different edit.';
  if(code==='not_found')return 'Discover current productions and source IDs. A missing receipt is not a successful edit.';
  return 'Read the relevant action schemas and current Studio context; correct the input before retrying.';
}
async function invoke(name, args) {
  const definition = tools.find((t) => t.name === name);
  if (!definition) throw new Error("Unknown tool.");
  validate(definition.inputSchema, args);
  if(name==='shutter_action_catalog')return api('/api/media/actions'+(args.types?.length?'?types='+encodeURIComponent(args.types.join(',')):''));
  if(name==='shutter_studio_context')return api('/api/media/action-context?'+new URLSearchParams(Object.entries(args).map(([key,value])=>[key,String(value)])));
  if(['shutter_preview_actions','shutter_apply_actions','shutter_action_receipt'].includes(name)){
    const {projectId,...input}=args,route='/api/media/productions/'+encodeURIComponent(projectId)+'/actions/';
    if(name==='shutter_action_receipt')return api(route+'receipts/'+encodeURIComponent(input.requestKey));
    return api(route+(name==='shutter_preview_actions'?'preview':'apply'),input);
  }
  if(name==='shutter_inspect_cutaway'){
    const {projectId,includeImages=true,...input}=args;
    const manifest=await api('/api/media/productions/'+encodeURIComponent(projectId)+'/actions/evidence',input);
    if(!manifest||manifest.schema!=='shutter-cutaway-evidence-v1'||manifest.projectId!==projectId||manifest.baseRevision!==args.baseRevision||manifest.previewHash!==args.previewHash||manifest.coverageId!==args.coverageId||typeof manifest.id!=='string'||!/^evidence_[a-f0-9]{64}$/.test(manifest.id)||!Array.isArray(manifest.frames)||manifest.frames.length<4||manifest.frames.length>6)throw new Error('evidence_manifest_invalid');
    const roles=new Set();
    for(const [position,frame] of manifest.frames.entries()){
      if(!frame||frame.index!==position||typeof frame.url!=='string'||frame.url!==`/api/media/productions/${encodeURIComponent(projectId)}/actions/evidence/${manifest.id}/frames/${frame.index}`||typeof frame.sha256!=='string'||!/^[a-f0-9]{64}$/.test(frame.sha256)||!['entry-before','entry-main','entry-alternate','return-alternate','return-main','return-after'].includes(frame.role)||roles.has(frame.role)||!Number.isSafeInteger(frame.sceneFrame)||frame.sceneFrame<0||typeof frame.sourceStart!=='string')throw new Error('evidence_manifest_invalid');
      roles.add(frame.role);
    }
    if(!includeImages)return manifest;
    const images=[];
    for(const frame of manifest.frames){
      const response=await fetch(base+frame.url,{redirect:'error',signal:AbortSignal.timeout(100000)});if(!response.ok)throw new Error('evidence_frame_unavailable');
      if(!/^image\/jpeg$/i.test(response.headers.get('content-type')||''))throw new Error('evidence_frame_invalid');
      const reader=response.body?.getReader();if(!reader)throw new Error('evidence_frame_invalid');let size=0;const chunks=[];
      for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>256*1024){await reader.cancel();throw new Error('evidence_frame_too_large');}chunks.push(Buffer.from(part.value));}
      const bytes=Buffer.concat(chunks);if(bytes.length<3||bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff)throw new Error('evidence_frame_invalid');
      const sha256=createHash('sha256').update(bytes).digest('hex');if(sha256!==frame.sha256)throw new Error('evidence_frame_integrity');
      images.push({type:'text',text:`Evidence frame ${frame.index}: ${frame.role} at scene frame ${frame.sceneFrame}, source ${frame.sourceStart}.`},{type:'image',data:bytes.toString('base64'),mimeType:'image/jpeg',_meta:{'shutter/role':frame.role,'shutter/frame':frame.index}});
    }
    return {...manifest,__imageBlocks:images};
  }
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
        "For Studio editing, discover shutter_action_catalog, read shutter_studio_context, preview and then apply exact commands with a stable requestKey. Use receipt lookup after uncertainty. Scene positions are output frames, source positions are exact seconds and sound positions are 48000 Hz sample frames. Legacy shot tools remain available. Use exact local IDs. A decoded take or successful edit is not continuity approval. Never invent a render result or repeat an unknown submission. This server does not start the local renderer.",
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
      const imageBlocks=result?.__imageBlocks||[];if(result?.__imageBlocks)delete result.__imageBlocks;
      return reply({
        content: [{ type: "text", text: JSON.stringify(result) },...imageBlocks],
        structuredContent: result,
      });
    } catch (e) {
      return reply({
        isError: true,
        content: [{ type: "text", text: e.message }],
        structuredContent: {error:e.message,recovery:recovery(e.message)},
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
