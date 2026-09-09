import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Studio } from "./store.mjs";
import { Renderer } from "./renderer.mjs";
import { exportCut } from "./cut.mjs";
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
      if (
        req.method === "POST" &&
        parts[0] === "api" &&
        parts[1] === "productions" &&
        parts[3] === "export-video" &&
        parts.length === 4
      )
        return json(res, 200, await exportCut(studio, parts[2]));
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
        return json(
          res,
          201,
          studio.prepareJob(input.projectId, input.shotId, input.requestKey),
        );
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
      if (req.method === "GET" && parts[0] === "media" && parts.length === 2) {
        const asset = studio.read(parts[1], "asset"),
          filename = studio.assetPath(asset.id);
        const size = fs.statSync(filename).size;
        res.setHeader("content-type", asset.mime);
        res.setHeader("cache-control", "private, max-age=31536000, immutable");
        res.setHeader("accept-ranges", "bytes");
        let start = 0,
          end = size - 1;
        if (req.headers.range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
          if (!match) return res.writeHead(416).end();
          start = Number(match[1]);
          end = match[2] ? Math.min(Number(match[2]), end) : end;
          if (start > end || start >= size)
            return res
              .writeHead(416, { "content-range": "bytes */" + size })
              .end();
          res.statusCode = 206;
          res.setHeader("content-range", `bytes ${start}-${end}/${size}`);
        }
        res.setHeader("content-length", end - start + 1);
        fs.createReadStream(filename, { start, end }).pipe(res);
        return;
      }
      const files = {
        "/": ["index.html", "text/html"],
        "/app.js": ["app.js", "text/javascript"],
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
