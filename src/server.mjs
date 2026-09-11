import {serveMediaAsset} from './media-stream.mjs';
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Studio } from "./store.mjs";
import { Renderer } from "./renderer.mjs";
import { exportCut } from "./cut.mjs";
import {productionWorkflow,decideTake} from './production-workflow.mjs';
import {reviewFrames} from './review-frames.mjs';
import {continueShot} from './continue-shot.mjs';
import {getCanvas,saveCanvas,connectReference} from './canvas.mjs';
import { handleMediaRequest } from './media-api.mjs';
const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
async function body(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const b of req) {
    size += b.length;
    if (size > limit) throw new Error("request_too_large");
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}
function json(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}
export function createServer({ studio, renderer }) {
  return http.createServer(async (req, res) => {
    try {
      const expectedHost = "127.0.0.1:" + req.socket.localPort;
      if (
        ![expectedHost, "localhost:" + req.socket.localPort].includes(
          req.headers.host,
        )
      ) {
        json(res, 403, { error: "local_host_required" });
        return;
      }
      if (
        req.headers.origin &&
        ![
          "http://" + expectedHost,
          "http://localhost:" + req.socket.localPort,
        ].includes(req.headers.origin)
      ) {
        json(res, 403, { error: "local_origin_required" });
        return;
      }
      if (req.headers["sec-fetch-site"] === "cross-site") {
        json(res, 403, { error: "local_origin_required" });
        return;
      }
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("referrer-policy", "no-referrer");
      res.setHeader(
        "content-security-policy",
        "default-src 'self'; img-src 'self' blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
      );
      const url = new URL(req.url, "http://" + expectedHost),
        parts = url.pathname.split("/").filter(Boolean);
      if (await handleMediaRequest(studio, req, res, url)) return;
      if(parts[0]==='api'&&parts[1]==='productions'&&parts[3]==='canvas'&&parts.length===4){
        if(req.method==='GET')return json(res,200,getCanvas(studio,parts[2]));
        if(req.method==='PUT'){const input=JSON.parse(await body(req));return json(res,200,saveCanvas(studio,parts[2],input.baseRevision,input.positions));}
      }
      if(req.method==='POST'&&parts[0]==='api'&&parts[1]==='productions'&&parts[3]==='connections'&&parts.length===4)return json(res,200,connectReference(studio,parts[2],JSON.parse(await body(req))));
      if(parts[0]==='api'&&parts[1]==='productions'&&parts[3]==='timeline'&&parts.length===4){
        if(req.method==='GET')return json(res,200,studio.getTimeline(parts[2]));
        if(req.method==='PUT'){const input=JSON.parse(await body(req));return json(res,200,studio.saveTimeline(parts[2],input.baseRevision,input.timeline));}
      }
      if(req.method==='POST'&&parts[0]==='api'&&parts[1]==='productions'&&parts[3]==='timeline'&&parts.length===5&&['undo','redo'].includes(parts[4])){
        const input=JSON.parse(await body(req));return json(res,200,studio.saveTimeline(parts[2],input.baseRevision,null,parts[4]));
      }
      if(req.method==='GET'&&parts[0]==='api'&&parts[1]==='productions'&&parts[3]==='workflow'&&parts.length===4)return json(res,200,productionWorkflow(studio,parts[2]));
      if(req.method==='POST'&&parts[0]==='api'&&parts[1]==='jobs'&&parts[3]==='decision'&&parts.length===4)return json(res,200,decideTake(studio,parts[2],JSON.parse(await body(req))));
      if(req.method==='GET'&&parts[0]==='api'&&parts[1]==='jobs'&&parts[3]==='frames'&&parts.length===4)return json(res,200,await reviewFrames(studio,parts[2]));
      if(req.method==='POST'&&parts[0]==='api'&&parts[1]==='productions'&&parts[3]==='continue-shot'&&parts.length===4)return json(res,201,await continueShot(studio,parts[2],JSON.parse(await body(req))));
      if (
        req.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "productions" &&
        parts[3] === "export-video" &&
        parts.length === 4
      ) {
        if (studio.list('timeline').find(t=>t.projectId===parts[2])?.timeline?.format==='shutter-media-edit-v1')
          return json(res,409,{error:'Use Camera & Music render with an explicit saved revision and color acknowledgement.'});
        return json(res, 200, await exportCut(studio, parts[2]));
      }
      if (req.method === "GET" && url.pathname === "/api/state") {
        const active = studio
          .listJobs()
          .filter(
            (j) => j.providerId && ["rendering", "verifying"].includes(j.state),
          );
        for (const job of active) await renderer.reconcile(job.id);
        return json(res, 200, {
          productions: studio.list("production"),
          assets: studio.list("asset"),
          jobs: studio.listJobs(),
          stages: studio.list("stage"),
          cuts: studio.list("cut"),
          timelines: studio.list('timeline').map(t=>({projectId:t.projectId,revision:t.revision,hash:t.hash||studio.timelinePlan(t.projectId,t.timeline).hash})),
          workflows: studio.list('production').map(p=>productionWorkflow(studio,p.id)),
          renderer: await renderer.health(),
        });
      }
      if (req.method === "POST" && url.pathname === "/api/assets") {
        const asset = studio.importAsset(await body(req, 32 * 1024 * 1024), {
          name: url.searchParams.get("name"),
          origin: "User imported reference",
        });
        return json(res, 201, asset);
      }
      if (req.method === "POST" && url.pathname === "/api/productions")
        return json(
          res,
          201,
          studio.createProduction(JSON.parse(await body(req))),
        );
      if (
        req.method === "PUT" &&
        parts[0] === "api" &&
        parts[1] === "productions" &&
        parts.length === 3
      ) {
        const input = JSON.parse(await body(req));
        return json(
          res,
          200,
          studio.saveProduction(parts[2], input.baseRevision, input),
        );
      }
      if (
        req.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "productions" &&
        parts[3] === "reuse-take" && parts.length === 4
      ) {
        const input=JSON.parse(await body(req));
        return json(res,201,studio.reuseTake(parts[2],input.baseRevision,input.shotId,input.sourceJobId));
      }
      if (
        req.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "productions" &&
        parts[3] === "take" &&
        parts.length === 4
      ) {
        const input = JSON.parse(await body(req));
        return json(
          res,
          200,
          studio.selectTake(
            parts[2],
            input.baseRevision,
            input.shotId,
            input.jobId,
          ),
        );
      }
      if (req.method === "POST" && url.pathname === "/api/jobs") {
        const input = JSON.parse(await body(req));
        let job=studio.prepareJob(input.projectId,input.shotId,input.requestKey);
        if(job.snapshot.workflow.startsWith('minimax/h3-max/'))job=await renderer.fal.prepare(job.id);
        return json(res,201,job);
      }
      if (
        req.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "jobs" &&
        parts.length === 4
      ) {
        if (parts[3] === "run")
          return json(res, 200, await renderer.submit(parts[2]));
        if (parts[3] === "review")
          return json(
            res,
            200,
            studio.reviewJob(parts[2], JSON.parse(await body(req))),
          );
      }
      if (
        req.method === "GET" &&
        parts[0] === "api" &&
        parts[1] === "export" &&
        parts.length === 3
      ) {
        res.setHeader(
          "content-disposition",
          'attachment; filename="shutter-production.json"',
        );
        return json(res, 200, studio.exportProduction(parts[2]));
      }
      if (
        req.method === "GET" &&
        parts[0] === "stage-files" &&
        parts.length === 3
      ) {
        const stage = studio.read(parts[1], "stage");
        if (
          !stage.files.includes(parts[2]) ||
          !/^[a-zA-Z0-9_.-]+$/.test(parts[2]) ||
          !/^[a-zA-Z0-9_-]+$/.test(stage.folder)
        )
          throw new Error("not_found");
        const filename = path.join(
          studio.root,
          "stages",
          stage.folder,
          parts[2],
        );
        res.writeHead(200, {
          "content-type": "application/octet-stream",
          "content-disposition": 'attachment; filename="' + parts[2] + '"',
          "content-length": fs.statSync(filename).size,
        });
        fs.createReadStream(filename).pipe(res);
        return;
      }
      if (['GET','HEAD'].includes(req.method) && parts[0] === 'media' && parts.length === 2) {
        await serveMediaAsset(studio,req,res,parts[1]);return;
      }
      const files = {
        "/": ["index.html", "text/html"],
        "/app.js": ["app.js", "text/javascript"],
        "/h3-ui.js": ["h3-ui.js", "text/javascript"],
        "/production-workflow.js": ["production-workflow.js", "text/javascript"],
        "/next-shot.js": ["next-shot.js", "text/javascript"],
        "/timeline.js": ["timeline.js", "text/javascript"],
        "/direct.js": ["direct.js", "text/javascript"],
        "/canvas.js": ["canvas.js", "text/javascript"],
        "/studio.css": ["studio.css", "text/css"],
        "/style.css": ["style.css", "text/css"],
      };
      if (req.method === "GET" && files[url.pathname]) {
        const [name, type] = files[url.pathname];
        res.writeHead(200, {
          "content-type": type,
          "cache-control": "no-cache",
        });
        res.end(fs.readFileSync(path.join(publicRoot, name)));
        return;
      }
      json(res, 404, { error: "not_found" });
    } catch (e) {
      const status = /conflict|busy|unknown/.test(e.message)
        ? 409
        : /offline|unavailable/.test(e.message)
          ? 503
          : e.message === "not_found"
            ? 404
            : 400;
      json(res, status, { error: e.message });
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root =
    process.env.SHUTTER_DATA ||
    fileURLToPath(new URL("../data/", import.meta.url));
  const studio = new Studio(root);
  const renderer = new Renderer(studio);
  // A process restart cannot invent the receipt of an interrupted submission.
  for (const job of studio.listJobs())
    if (job.state === "submitting")
      studio.updateJob(job.id, {
        state: job.providerId ? "rendering" : "unknown",
        error:
          "The app restarted during submission. Reconcile before another attempt.",
      });
  const server = createServer({ studio, renderer });
  server.listen(4677, "127.0.0.1", () =>
    console.log("Shutter is open at http://127.0.0.1:4677"),
  );
  process.on("SIGINT", () =>
    server.close(() => {
      studio.close();
      process.exit(0);
    }),
  );
}
