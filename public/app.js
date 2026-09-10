import {createH3UI} from "/h3-ui.js";
import {createProductionWorkflow} from '/production-workflow.js';
import {createNextShotUI} from '/next-shot.js';
import {createTimelineUI} from '/timeline.js';
import {createDirectUI} from '/direct.js';
import {createCanvasUI} from '/canvas.js';
const app = document.querySelector("#app");
const icons = {
  canvas: '<rect x="2" y="3" width="7" height="7" rx="2"/><rect x="15" y="14" width="7" height="7" rx="2"/><path d="M9 6h5a4 4 0 0 1 4 4v4"/>',
  edit: '<path d="M3 4h18M3 12h18M3 20h18M9 2v20"/><rect x="12" y="6" width="8" height="4" rx="1"/><rect x="3" y="14" width="12" height="4" rx="1"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  moment: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  cast: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',
  place: '<path d="m3 10 9-7 9 7v11H3zM9 21v-8h6v8"/>',
  review:
    '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  jobs: '<path d="M12 3v9l6 3"/><circle cx="12" cy="12" r="9"/>',
  stage: '<path d="m12 2 10 5v10l-10 5-10-5V7zM2 7l10 5 10-5M12 12v10"/>',
  aperture:
    '<circle cx="12" cy="12" r="10"/><path d="m12 2 5 8M22 10l-9 1M19 20l-5-8M8 22l3-9M2 14l8-3M5 4l6 8"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.film}</svg>`;
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let data = {
    productions: [],
    assets: [],
    jobs: [],
    renderer: { online: false },
  },
  projectId = localStorage.getItem("shutter.project"),
  shotId = localStorage.getItem("shutter.shot"),
  view = ['film','canvas','edit','settings','moment','cast','place','stage','review','jobs','projects'].includes(location.hash.slice(1))?location.hash.slice(1):'film',
  dirty = false,
  momentAsset = null,
  busy = false,
  playing = false,
  playTimer = null;
const media = (id) => "/media/" + encodeURIComponent(id);
const production = () =>
  data.productions.find((p) => p.id === projectId) || data.productions[0];
const shot = () =>
  production()?.shots.find((s) => s.id === shotId) || production()?.shots[0];
let stateSignature = null;
let previewJobId = null,
  playCut = false,
  libraryDraft = null;
const draftKey = "shutter.moment.draft";
let momentDraft;
try {
  momentDraft = JSON.parse(localStorage.getItem(draftKey) || "{}");
} catch {
  momentDraft = {};
}
const saveMomentDraft = () =>
  localStorage.setItem(draftKey, JSON.stringify(momentDraft));
const chosen = (s) =>
  data.jobs.find((j) => j.id === s?.selectedTake && j.state === "ready");
const takeFor = (s) =>
  data.jobs.find(
    (j) =>
      j.id === previewJobId &&
      j.shotId === s?.id &&
      j.projectId === production()?.id &&
      j.state === "ready",
  ) ||
  chosen(s) ||
  data.jobs
    .filter(
      (j) =>
        j.projectId === production()?.id &&
        j.shotId === s?.id &&
        j.state === "ready",
    )
    .at(-1);
const latest = (s) =>
  data.jobs
    .filter((j) => j.projectId === production()?.id && j.shotId === s?.id)
    .at(-1);
const asset = (id) => data.assets.find((a) => a.id === id);
const h3UI=createH3UI({data:()=>data,asset,imageOptions,esc});
const flow=createProductionWorkflow({data:()=>data,production,shot,take:()=>takeFor(shot()),esc,media});
const nextShot=createNextShotUI({data:()=>data,production,shot,esc,media,imageOptions});
const timelineUI=createTimelineUI({data:()=>data,production,esc,media,api,notify,refresh,markDirty:value=>{dirty=value;}});
const directUI=createDirectUI({data:()=>data,production,shot,takeFor,esc,media,strip,empty,api,refresh,notify,go,markDirty:value=>{dirty=value;}});
const canvasUI=createCanvasUI({data:()=>data,production,shot,esc,media,api,refresh,notify,go,selectShot,markDirty:value=>{dirty=value;}});
const stateLabel = {
  prepared: "Prepared",
  submitting: "Submitting",
  rendering: "Rendering",
  verifying: "Checking video",
  ready: "Ready to review",
  failed: "Needs attention",
  unknown: "Outcome unknown",
};
const message = (e) =>
  ({
    renderer_offline:
      "The local renderer is offline. Your prepared shot is saved.",
    renderer_busy:
      "A render is already using this machine. This shot is saved for later.",
    revision_conflict:
      "A newer revision exists. Your changes are still here; reload to compare before saving.",
    request_conflict:
      "This saved request belongs to an earlier revision. Save your changes and prepare again.",
    submission_unknown:
      "Submission needs reconciliation. Shutter will not submit a duplicate.",
    asset_integrity:
      "A source file has changed or is missing. Restore the original before rendering.",
  })[e] || e;
function notify(text) {
  const toast = document.querySelector("#toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 6000);
}
async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: options.raw
      ? undefined
      : { "content-type": "application/json", ...options.headers },
  });
  const value = await res.json();
  if (!res.ok) throw new Error(value.error || "Request failed");
  return value;
}
async function refresh(renderNow = true) {
  try {
    data = await api("/api/state");
    const signature = JSON.stringify([
      data.productions,
      data.assets,
      data.jobs,
      data.stages,
      data.timelines,
      data.cuts,
      data.renderer.online,
      data.renderer.fal,
    ]);
    const changed = signature !== stateSignature;
    stateSignature = signature;
    if (!data.productions.find((p) => p.id === projectId))
      projectId = data.productions[0]?.id;
    if (!momentAsset && momentDraft.reference)
      momentAsset = asset(momentDraft.reference) || null;
    if (renderNow && !dirty && !playing && (changed || !app.children.length))
      render();
  } catch (e) {
    notify(message(e.message));
  }
}
function go(next) {
  if (dirty && !confirm("Leave these unsaved changes?")) return;
  dirty = false;
  libraryDraft = null;
  stopPlayback();
  view = next;
  history.replaceState(null,'','#'+view);
  render();
}
function selectShot(id) {
  if (dirty && !confirm("Leave these unsaved shot changes?")) return;
  dirty = false;
  previewJobId = null;
  stopPlayback();
  shotId = id;
  localStorage.setItem("shutter.shot", id);
  render();
}
function header() {
  const p = production(),
    cut = data.cuts
      ?.filter(
        (c) =>
          c.projectId === p?.id &&
          (data.timelines?.some(t=>t.projectId===p.id)?data.timelines.some(t=>t.projectId===p.id&&t.hash===c.plan.hash):c.plan.takes.length === p.shots.length && c.plan.takes.every((t, i) => t.jobId === p.shots[i].selectedTake)),
      )
      .at(-1);
  return `<header class="topbar"><div class="brand-line"><button class="project-switch" data-projects>Productions <span>/</span> <strong>${esc(p?.title||'Your studio')}</strong><span>⌄</span></button></div><div class="top-actions"><span class="saved-indicator"><i class="signal-dot"></i> Local project</span>${p?cut?`<a class="export-button" href="${media(cut.output)}" download>Export film ↗</a>`:`<button class="export-button" data-nav="edit">Open edit ↗</button>`:''}</div></header>`;
}
function rail() {
  const button=([id,name])=>`<button data-nav="${id}" class="${view===id||(view==='settings'&&id==='film')?'active':''}" aria-current="${view===id?'page':'false'}">${icon(id)}<span>${name}</span></button>`;
  return `<aside class="rail"><button class="studio-brand" data-nav="film" aria-label="Shutter home">${icon('aperture')}<span>shutter<span class="brand-period">.</span></span></button><nav class="primary-nav" aria-label="Studio">${[['film','Direct'],['canvas','Canvas'],['edit','Edit']].map(button).join('')}</nav><div class="rail-divider"></div><div class="moment-nav">${button(['moment','Moment'])}</div><details class="library-nav" open><summary>Library & tools</summary><nav aria-label="Library and tools">${[['cast','Cast'],['place','Places'],['stage','3D stage'],['review','Continuity'],['jobs','Renders']].map(button).join('')}</nav></details><div class="rail-foot"><span class="connection-state"><i class="signal-dot"></i>${data.renderer.fal?.configured?'H3 Max connected':'Local studio'}</span>${production()?`<a href="/api/export/${production().id}">Save production file ↗</a>`:''}<span class="company-name">ETERNITIES</span></div></aside>`;
}
function head(title, sub, tabs = false) {
  return `<div class="production-head"><div><div class="eyeline">${esc(sub)}</div><h1>${esc(title)}</h1><div class="subtle">${production() ? `Saved on this machine · Revision ${production().revision}` : "Create on your terms"}</div></div>${tabs ? `<div class="tabs"><button class="selected" data-nav="film">Shot sequence</button><button data-nav="review">Continuity review</button><button data-projects>All productions</button></div>` : ""}</div>`;
}
function status(job) {
  return job
    ? `<span class="job-pill ${esc(job.state)}">${esc(stateLabel[job.state] || job.state)}</span>`
    : '<span class="job-pill">Reference frame</span>';
}
function strip() {
  const p = production(),
    s = shot();
  return `<section class="strip-section"><div class="strip-head"><h2>Scene 01 <span> / ${p.shots.length} shots</span></h2><span>${p.shots.reduce((sum, x) => sum + x.frames / x.fps, 0).toFixed(1)} seconds planned</span></div><div class="strip">${p.shots.map((x, i) => `<button class="shot-card ${x.id === s?.id ? "active" : ""}" data-shot="${x.id}" aria-label="Select shot ${i + 1}: ${esc(x.title)}">${chosen(x)?.output?`<video src="${media(chosen(x).output)}" muted playsinline preload="metadata" aria-hidden="true"></video>`:x.reference?`<img src="${media(x.reference)}" alt="Reference for ${esc(x.title)}">`:""}<div class="card-info"><strong>${String(i + 1).padStart(2, "0")} &nbsp; ${esc(x.title)}</strong><small>${(x.frames / x.fps).toFixed(1)}s</small>${chosen(x)?flow.badge(chosen(x)):""}</div></button>`).join("")}<button class="add-shot" id="add-shot">+ Add shot</button></div></section>`;
}
function film() {
  const p = production(),
    s = shot();
  if (!p) return empty();
  if (!s)
    return (
      head(p.title, "Production") +
      `<div class="empty"><p>This production has no shots yet.</p><button id="add-shot" class="outline-button">Add a shot</button></div>`
    );
  const job = latest(s),
    take = playing && playCut ? chosen(s) : takeFor(s),
    ready = !!take?.output && (!playing || playCut);
  return (
    head(p.title, p.subtitle || "Original animated short", true) +
    flow.prep() +
    nextShot.lineage() + nextShot.render() +
    `<div class="room"><section class="stage"><div class="viewer">${ready ? `<video id="take-player" src="${media(take.output)}" poster="${media(take.snapshot.shot.reference)}" controls playsinline preload="metadata"></video>` : `${s.reference ? `<img src="${media(s.reference)}" alt="${esc(s.title)} reference frame">` : `<div class="empty-review"><h2>${esc(s.title)}</h2><p>A description is ready. Prepare the shot to see its estimate.</p></div>`}`}<span class="frame-note">${ready ? (s.selectedTake === take.id ? "Selected video take" : "Video candidate") : "Reference frame · not rendered"} &nbsp; / &nbsp; ${String(p.shots.indexOf(s) + 1).padStart(2, "0")}</span></div><div class="viewer-footer"><div class="film-transport"><button id="play-sequence">${playing ? "Stop" : "Play " + (p.shots.every((x) => chosen(x)) ? "cut" : "boards")}</button><strong>${esc(s.title)}</strong></div><div class="shot-meta"><span>${ready ? take.media.width : s.width} × ${ready ? take.media.height : s.height}</span><span>${ready ? take.media.fps : s.fps} fps</span><span>${(ready ? take.media.duration : s.frames / s.fps).toFixed(2)}s ${ready ? "actual" : "planned"}</span></div></div><div class="story-state"><div><strong>Entering the shot</strong>${esc(s.before || "No starting state recorded.")}</div><div><strong>Leaving the shot</strong>${esc(s.after || "No ending state recorded.")}</div></div></section><aside class="inspector"><h2>Direct this shot</h2><p class="desc">Shape the performance. Keep the world.</p>${takePicker(s)}<form id="shot-form">${h3UI.fields(s,p)}<label class="field"><span>Shot title</span><input id="shot-title" value="${esc(s.title)}"></label><label class="field"><span>Action</span><textarea id="action" rows="4">${esc(s.action)}</textarea></label><label class="field"><span>Camera</span><input id="camera" value="${esc(s.camera)}"></label><div class="split-fields"><label class="field" id="local-timing" ${s.generation ? "hidden" : ""}><span>Frames at 24 fps</span><select id="frames">${[49, 97, 121, 145, 193, 241].map((n) => `<option value="${n}" ${s.frames === n ? "selected" : ""}>${(n / 24).toFixed(2)} seconds</option>`).join("")}</select></label><label class="field"><span>Variation seed</span><input id="seed" type="number" min="0" value="${s.seed}"></label></div><label class="field"><span>Shot reference</span><select id="shot-reference"><option value="">No opening image</option>${imageOptions(s.reference)}</select></label><fieldset class="cast-checks"><legend>Cast in this shot</legend>${(p.cast || []).map((c) => `<label><input type="checkbox" name="shot-cast" value="${esc(c.id)}" ${(s.cast || []).includes(c.id) ? "checked" : ""}> ${esc(c.name)}</label>`).join("")}</fieldset><div class="reference-row">${s.reference ? `<img src="${media(s.reference)}" alt="Selected reference">` : ""}<div><strong>${esc(asset(s.reference)?.name || "Description only")}</strong><small>${s.reference ? "Exact image bound to this shot" : "No opening image supplied"}</small></div></div><button class="primary" type="submit">Save shot</button></form><button id="prepare" class="secondary" >Prepare shot and estimate</button>${job ? `<div class="reference-row"><div>${status(job)}<small>${job.state === "prepared" ? "Saved. No video submitted." : esc(job.providerId ? "Provider receipt retained" : "")}</small></div></div>${job.state === "prepared" ? `<button id="run-job" class="primary" ${job.snapshot.shot.generation ? (!data.renderer.fal?.configured || !job.quote ? "disabled" : "") : !data.renderer.online ? "disabled" : ""}>${job.quote ? "Render · reserve $" + job.quote.reservedUsd.toFixed(3) : "Render this shot locally"}</button>` : ""}${job.state === "ready" ? '<button data-nav="review" class="secondary">Review this take</button>' : ""}` : ""}${h3UI.budget(s,job)}${flow.cost(job)}${job?.error ? `<div class="job-error">${esc(message(job.error))}</div>` : ""}</aside></div>${strip()}`
  );
}
function empty() {
  return `<div class="empty"><h1>Your next frame starts here.</h1><p>Build a production with recurring cast and places, or animate a single Moment. Your work stays on this machine.</p><button data-nav="moment" class="outline-button">Create a Moment</button></div>`;
}
function imageOptions(selected) {
  return data.assets
    .filter((a) => a.kind === "image")
    .map(
      (a) =>
        `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${esc(a.name)}</option>`,
    )
    .join("");
}
function takePicker(s) {
  const takes = data.jobs.filter(
    (j) =>
      j.projectId === production()?.id &&
      j.shotId === s.id &&
      j.state === "ready",
  );
  const reuse=data.jobs.filter(j=>j.state==='ready'&&j.output&&j.projectId!==production()?.id&&!j.sourceJobId);
  return (takes.length
    ? `<label class="field"><span>Take selected for the cut</span><select id="selected-take"><option value="">Choose a rendered take</option>${takes.map((j, i) => `<option value="${j.id}" ${s.selectedTake === j.id ? "selected" : ""}>Take ${i + 1} · seed ${j.snapshot.shot.seed}</option>`).join("")}</select></label>`
    : "")+(reuse.length?`<label class="field"><span>Reuse an existing take · no generation charge</span><select id="reuse-take"><option value="">Choose saved footage</option>${reuse.map(j=>`<option value="${j.id}">${esc(j.snapshot.title)} / ${esc(j.snapshot.shot.title)}</option>`).join('')}</select></label>`:'');
}
function castView() {
  const p = production();
  if (libraryDraft) return libraryEditor();
  return (
    head("Cast", "The people your story remembers") +
    `<div class="library-actions"><button class="outline-button" data-edit-cast="new">Create a character</button></div>` +
    `<div class="notice">These are selected reference candidates. A reference lock fixes the source version; it does not guarantee every rendered face. Review generated takes against these originals.</div><div class="library">${(p?.cast || []).map((c) => `<article class="reference-card"><img src="${media(c.reference)}" alt="${esc(c.name)} selected reference"><div class="reference-content"><span class="tag">Reference v${c.version || 1}</span><h2>${esc(c.name)}</h2><button class="small-link" data-edit-cast="${esc(c.id)}">Edit character reference</button><p>${esc(c.description)}</p><p><strong>Continuity cues</strong><br>${esc(c.cues || "Compare identity and costume across every take.")}</p></div></article>`).join("")}</div>`
  );
}
function placeView() {
  const p = production();
  if (libraryDraft) return libraryEditor();
  return (
    head(p?.place?.name || "Places", "One location, every angle") +
    `<div class="library-actions"><button class="outline-button" id="edit-place">Edit location reference</button></div>` +
    `<div class="library"><article class="reference-card">${p?.place?.reference ? `<img src="${media(p.place.reference)}" alt="Selected location reference">` : ""}<div class="reference-content"><span class="tag">Set reference v${p?.place?.version || 1}</span><h2>${esc(p?.place?.name)}</h2><p>${esc(p?.place?.description)}</p></div></article><div class="long-form"><h2>What must carry through</h2><p>${esc(p?.place?.cues)}</p><h2>The look</h2><p>${esc(p?.style)}</p><p>Every prepared shot snapshots this version. A new location reference affects future work only after a saved revision.</p></div></div>`
  );
}
function reviewView() {
  const s = shot(),
    job = takeFor(s),
    reference = job?.snapshot.shot || s;
  return (
    head("Continuity review", "The same people. The same world.") +
    (s?flow.review():'') +
    (s
      ? `<div class="review-room"><div class="compare-grid"><div>${reference.reference?`<img src="${media(reference.reference)}" alt="Selected shot reference">`:`<div class="frame-placeholder">No opening image for this take</div>`}<p class="compare-label">Reference saved with this take / ${esc(reference.title)}</p></div><div>${job?.output ? `<video src="${media(job.output)}" controls playsinline></video><p class="compare-label">Rendered take / ${esc(job.providerId)}</p>` : `<div class="empty-review"><h2>No video to review yet</h2><p>Prepare and render this shot to compare movement, face, costume and set against the reference.</p><button data-nav="film" class="outline-button">Return to shot</button></div>`}</div></div>${
          job?.output
            ? `<form id="review-form"><div class="review-form">${[
                "face",
                "costume",
                "set",
                "light",
                "motion",
                "story",
              ]
                .map(
                  (c) =>
                    `<label class="field"><span>${c[0].toUpperCase() + c.slice(1)}</span><select name="${c}">${[
                      ["unseen", "Not yet checked"],
                      ["pass", "Consistent"],
                      ["revise", "Needs another take"],
                    ]
                      .map(
                        ([v, l]) =>
                          `<option value="${v}" ${job.review?.[c] === v ? "selected" : ""}>${l}</option>`,
                      )
                      .join("")}</select></label>`,
                )
                .join(
                  "",
                )}</div><label class="field"><span>Review notes</span><textarea name="note" rows="3" placeholder="Check the beginning, middle and end. Name the detail that changed.">${esc(job.review?.note || "")}</textarea></label><div class="review-actions"><button class="primary">Save this take’s review</button></div></form>`
            : ""
        }</div>${strip()}`
      : empty())
  );
}
function momentView() {
  return (
    head("A single moment", "One image. A direction. A moving scene.") +
    `<div class="moment-layout"><div class="dropzone">${momentAsset ? `<div><img src="${media(momentAsset.id)}" alt="Moment input image"><p>${esc(momentAsset.name)}</p><button id="change-moment" class="small-link">Choose another image</button></div>` : `<div>${icon("moment")}<h2>Give the moment a first frame</h2><p>Import a PNG or JPEG. The original stays on this machine.</p><input id="moment-file" type="file" accept="image/png,image/jpeg" aria-label="Import a Moment image">${shot()?.reference ? '<p><button id="use-current" class="small-link">Use the current shot’s reference</button></p>' : ""}</div>`}</div><aside class="inspector"><h2>What happens next?</h2><p class="desc">Keep the immediacy of Moment. A production is optional.</p><form id="moment-form"><label class="field"><span>Direction</span><textarea id="moment-action" rows="5" placeholder="A glance toward the window. The light begins to change.">${esc(momentDraft.action || "")}</textarea></label><label class="field"><span>Title</span><input id="moment-title" value="${esc(momentDraft.title || "Untitled moment")}"></label><button class="primary" ${!momentAsset ? "disabled" : ""}>Save and prepare Moment</button></form><p class="render-help">5.04 seconds at 768 × 512. Your input image and request are saved before rendering. You can develop the resulting shot into a longer production.</p></aside></div>`
  );
}
function jobsView() {
  return (
    head("Render room", "Exact requests, recoverable takes") +
    `<div class="jobs-list">${
      data.jobs.length
        ? data.jobs
            .toReversed()
            .map(
              (j) =>
                `<article class="job-row"><div><h3>${esc(j.snapshot.title)} / ${esc(j.snapshot.shot.title)}</h3>${status(j)}${flow.badge(j)}${flow.cost(j)}<p>${j.snapshot.shot.width} × ${j.snapshot.shot.height} / ${(j.snapshot.shot.frames / 24).toFixed(2)}s / seed ${j.snapshot.shot.seed}</p><p>${esc(j.providerId ? "Provider receipt " + j.providerId : "No provider submission yet.")}${j.elapsedSeconds ? " / " + Math.round(j.elapsedSeconds) + " seconds elapsed" : ""}</p>${j.error ? `<p class="job-error">${esc(message(j.error))}</p>` : ""}${j.output ? `<a href="${media(j.output)}" download>Download video take</a>` : ""}</div><button class="outline-button" data-open-job="${j.id}">Open shot</button></article>`,
            )
            .join("")
        : '<div class="empty-review"><h2>No renders yet</h2><p>Your prepared shots and actual video results will appear here.</p></div>'
    }</div>`
  );
}
function stageView() {
  const stage = data.stages?.find((s) => s.projectId === production()?.id);
  if (stage)
    return (
      head(
        "The mountain observatory",
        "One saved set / three physical cameras",
      ) +
      `<div class="notice">These images were rendered from an actual Blender scene. The actors are blocking proxies. This establishes camera and set geometry; it does not prove that a video model follows that geometry.</div><div class="library-actions"><a class="outline-button" href="/stage-files/${stage.id}/observatory.blend">Download Blender scene</a><a class="outline-button" href="/stage-files/${stage.id}/stage.json">Download camera and object layout</a></div><div class="stage-views">${stage.views.map((v) => `<article class="reference-card"><img src="${media(v.reference)}" alt="Blender blocking for ${esc(v.shotId)}"><div class="reference-content"><span class="tag">Blender blocking / v${stage.version}</span><h2>${esc(production()?.shots.find((s) => s.id === v.shotId)?.title || v.shotId)}</h2><p>${v.focalLengthMm} mm camera · same actors, props and set</p><a href="/stage-files/${stage.id}/${v.passes}">Download depth, normal and object passes</a></div></article>`).join("")}</div><div class="long-form"><h2>Next: carry the movement into generation</h2><p>A video reference can carry camera motion and blocking. Separate character and place references carry appearance. A multimodal adapter must consume each source in its declared role. The current Wan path consumes only its selected first image.</p></div>`
    );
  return (
    head("The stage", "Camera and geography belong to the production") +
    `<div class="notice">Blender control is a planned integration, not an active renderer in this build. The current Wan lane accepts a first image; it does not accept a full depth, pose or camera track.</div><div class="library"><article class="reference-card"><img src="${media(production()?.place?.reference)}" alt="The observatory staging reference"><div class="reference-content"><h2>A set that persists</h2><p>Place characters, props and cameras in one persistent scene. Render blocking references and compare generated footage against them. A new shot changes the camera, not the identity of the set.</p></div></article><div class="long-form"><h2>Three kinds of control</h2><p><strong>Reference image</strong><br>The implemented local lane uses the selected first frame to guide appearance and initial composition.</p><p><strong>Blender blocking</strong><br>Planned scene files retain camera transforms, actor positions, scale and prop state. Proxy renders will be explicitly identified.</p><p><strong>Motion-conditioned generation</strong><br>A later adapter must prove that it consumes the actual blocking video, pose or depth. A prompt describing a camera move is not equivalent.</p></div></div>`
  );
}
function libraryEditor() {
  const d = libraryDraft;
  return (
    head(
      d.kind === "cast" ? "Character reference" : "Location reference",
      "A saved version for future shots",
    ) +
    `<div class="moment-layout"><article class="reference-card">${d.reference ? `<img src="${media(d.reference)}" alt="Reference being edited">` : ""}<div class="reference-content"><h2>Keep a clear original</h2><p>The name, appearance and continuity cues travel with each prepared shot. Changing a reference creates a new library version. Existing render requests keep their originals.</p></div></article><aside class="inspector"><form id="library-form"><label class="field"><span>Name</span><input name="name" required value="${esc(d.name)}"></label><label class="field"><span>Appearance and materials</span><textarea name="description" rows="5">${esc(d.description)}</textarea></label><label class="field"><span>Continuity cues</span><textarea name="cues" rows="3">${esc(d.cues)}</textarea></label><label class="field"><span>Selected reference</span><select name="reference">${imageOptions(d.reference)}</select></label><label class="field"><span>Import another reference</span><input id="library-file" type="file" accept="image/png,image/jpeg"></label><button class="primary">Save reference version</button><button class="secondary" type="button" id="cancel-library">Cancel</button></form></aside></div>`
  );
}
function projectsView() {
  return (
    head("Productions", "Work that survives the session") +
    `<div class="project-list">${data.productions.map((p) => `<button class="project-tile" data-project="${p.id}">${p.shots[0]?.reference ? `<img src="${media(p.shots[0].reference)}" alt="${esc(p.title)} cover">` : ""}<div><h2>${esc(p.title)}</h2><p>${p.shots.length} shots / revision ${p.revision}</p></div></button>`).join("")}</div>`
  );
}
function render() {
  app.innerHTML = `<div class="app-shell">${rail()}<main class="workspace" data-view="${view}">${header()}<div class="workspace-body">${({ film:directUI.render,canvas:canvasUI.render,settings:film, edit:timelineUI.render, cast: castView, place: placeView, review: reviewView, moment: momentView, jobs: jobsView, stage: stageView, projects: projectsView }[view] || directUI.render)()}</div></main></div>`;
  wire();
  timelineUI.wire();
  directUI.wire();
  canvasUI.wire();
  if(matchMedia('(max-width:620px)').matches)document.querySelector('.library-nav')?.removeAttribute('open');
}
function guarded(fn) {
  return async (e) => {
    e?.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await fn(e);
    } catch (e) {
      notify(message(e.message));
    } finally {
      busy = false;
    }
  };
}
async function saveShot() {
  const p = production(),
    s = shot();
  const next = {
    ...p,
    baseRevision: p.revision,
    shots: p.shots.map((x) =>
      x.id === s.id
        ? {
            ...x,
            title: document.querySelector("#shot-title").value,
            reference: document.querySelector("#shot-reference").value,
            cast: [
              ...document.querySelectorAll("[name=shot-cast]:checked"),
            ].map((e) => e.value),
            action: document.querySelector("#action").value,
            camera: document.querySelector("#camera").value,
            frames: Number(document.querySelector("#frames").value),
            seed: Number(document.querySelector("#seed").value),
            ...h3UI.values(p,s),
          }
        : x,
    ),
  };
  await api("/api/productions/" + p.id, {
    method: "PUT",
    body: JSON.stringify(next),
  });
  dirty = false;
  await refresh();
  notify("Shot saved. Earlier render requests keep their original settings.");
}
async function prepare() {
  if (dirty) await saveShot();
  const p = production(),
    s = shot();
  const keyName = `shutter.request.${p.id}.${s.id}.${p.revision}`;
  let key = localStorage.getItem(keyName);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(keyName, key);
  }
  await api("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ projectId: p.id, shotId: s.id, requestKey: key }),
  });
  await refresh();
  notify("Shot prepared and saved. No video has been submitted.");
}
function stopPlayback() {
  playing = false;
  clearTimeout(playTimer);
}
function playSequence() {
  if(data.timelines?.some(t=>t.projectId===production()?.id)){go('edit');return;}
  if (playing) {
    stopPlayback();
    render();
    return;
  }
  if (dirty) {
    notify("Save your changes before playing the sequence.");
    return;
  }
  const p = production();
  playCut = p.shots.every((s) => chosen(s));
  previewJobId = null;
  playing = true;
  let index = 0;
  function advance() {
    if (!playing) return;
    if (index >= p.shots.length) {
      stopPlayback();
      render();
      return;
    }
    shotId = p.shots[index++].id;
    render();
    const v = document.querySelector("#take-player");
    if (v) {
      v.onended = advance;
      v.play().catch(() => {
        stopPlayback();
        notify("Press play in the video viewer to start playback.");
      });
    } else
      playTimer = setTimeout(
        advance,
        (p.shots[index - 1].frames / p.shots[index - 1].fps) * 1000,
      );
  }
  advance();
}
function wire() {
  const nextForm=document.querySelector('#next-shot-form');
  nextForm?.addEventListener('input',nextShot.remember);
  nextForm?.addEventListener('change',nextShot.remember);
  document.querySelector('#next-composition')?.addEventListener('change',e=>{
    const newAngle=e.target.value==='new';document.querySelector('#next-image-field').hidden=!newAngle;document.querySelector('#next-image').required=newAngle;
  });
  document.querySelector('#next-load-frame')?.addEventListener('click',guarded(async()=>{
    if(dirty)throw Error('Save the current shot before loading its ending.');
    nextShot.remember();await api('/api/jobs/'+nextShot.source().id+'/frames');await refresh();
    document.querySelector('.next-shot').open=true;
  }));
  nextForm?.addEventListener('submit',guarded(async()=>{
    if(dirty)throw Error('Save the current shot before continuing it.');
    nextShot.remember();const p=production(),j=nextShot.source();
    const result=await api('/api/productions/'+p.id+'/continue-shot',{method:'POST',body:JSON.stringify({...Object.fromEntries(new FormData(nextForm)),baseRevision:p.revision,sourceJobId:j.id})});
    nextShot.clear();shotId=result.shotId;previewJobId=null;localStorage.setItem('shutter.shot',shotId);await refresh();
    notify('Next shot created from the saved ending. Review current conditions, then prepare its estimate. No video submitted.');
  }));
  document.querySelector('#review-take')?.addEventListener('change',e=>{
    if(dirty){e.target.value=takeFor(shot())?.id;notify('Save your review notes before switching takes.');return;}
    previewJobId=e.target.value;render();
  });
  document.querySelector('#decision-note')?.addEventListener('input',()=>{dirty=true;});
  document.querySelector('#load-boundary')?.addEventListener('click',guarded(async()=>{
    if(dirty)throw Error('Save your review note before loading comparison frames.');
    const j=takeFor(shot()),info=flow.takeState(j);
    await Promise.all([j.id,info?.previousJobId].filter(Boolean).map(id=>api('/api/jobs/'+id+'/frames')));
    await refresh();notify('Actual first and last frames loaded. No generation charge.');
  }));
  document.querySelectorAll('[data-decision]').forEach(button=>button.addEventListener('click',guarded(async()=>{
    if(document.querySelector('#review-form')?.dataset.changed)throw Error('Save the detailed review before making a decision.');
    const j=takeFor(shot()),info=flow.takeState(j),note=document.querySelector('#decision-note').value;
    await api('/api/jobs/'+j.id+'/decision',{method:'POST',body:JSON.stringify({baseRevision:production().revision,contextHash:info.contextHash,decision:button.dataset.decision,note})});
    dirty=false;await refresh();notify(button.dataset.decision==='accepted'?'This exact take is accepted and selected for the cut.':'Revision note saved. Edit this shot; other takes remain unchanged.');
  })));
  document.querySelector("#generation-mode")?.addEventListener("change",e=>{
    document.querySelector("#h3-fields").hidden=e.target.value==="local";
    document.querySelector("#local-timing").hidden=e.target.value!=="local";
    dirty=true;
  });
  document.querySelector("#shot-asset-file")?.addEventListener("change",guarded(async e=>{
    const file=e.target.files[0];if(!file)return;
    const imported=await api("/api/assets?name="+encodeURIComponent(file.name),{method:"POST",body:file,raw:true});
    await refresh(false);
    for(const select of document.querySelectorAll("#shot-form select[data-assets]")){
      if(select.dataset.assets!==imported.kind)continue;
      select.add(new Option(imported.name,imported.id));
    }
    if(imported.kind==="image")document.querySelector("#shot-reference").add(new Option(imported.name,imported.id));
    notify("Reference imported. Select where it belongs, then save the shot.");
  }));
  document.querySelector("#export-cut")?.addEventListener(
    "click",
    guarded(async (e) => {
      if (dirty) throw new Error("Save your changes before exporting.");
      e.currentTarget.textContent = "Exporting…";
      await api("/api/productions/" + production().id + "/export-video", {
        method: "POST",
        body: "{}",
      });
      await refresh();
      notify("Review cut exported and decoded. It is ready to download.");
    }),
  );
  document.querySelectorAll("[data-edit-cast]").forEach(
    (b) =>
      (b.onclick = () => {
        const current = production()?.cast?.find(
          (c) => c.id === b.dataset.editCast,
        );
        libraryDraft = {
          ...(current || {
            id: "cast_" + crypto.randomUUID().slice(0, 8),
            name: "",
            description: "",
            cues: "",
            version: 0,
            reference: data.assets.find((a) => a.kind === "image")?.id,
          }),
          kind: "cast",
        };
        render();
      }),
  );
  document.querySelector("#edit-place")?.addEventListener("click", () => {
    libraryDraft = { ...production()?.place, kind: "place" };
    render();
  });
  document.querySelector("#cancel-library")?.addEventListener("click", () => {
    if (dirty && !confirm("Discard this unfinished reference edit?")) return;
    dirty = false;
    libraryDraft = null;
    render();
  });
  document.querySelector("#library-form")?.addEventListener("input", (e) => {
    libraryDraft = {
      ...libraryDraft,
      ...Object.fromEntries(new FormData(e.currentTarget)),
    };
    dirty = true;
  });
  document.querySelector("#library-file")?.addEventListener(
    "change",
    guarded(async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const imported = await api(
        "/api/assets?name=" + encodeURIComponent(file.name),
        { method: "POST", body: file, raw: true },
      );
      libraryDraft.reference = imported.id;
      dirty = true;
      await refresh(false);
      render();
    }),
  );
  document.querySelector("#library-form")?.addEventListener(
    "submit",
    guarded(async () => {
      const p = production(),
        { kind, ...d } = libraryDraft;
      const next = { ...d, version: (Number(d.version) || 0) + 1 };
      await api("/api/productions/" + p.id, {
        method: "PUT",
        body: JSON.stringify({
          ...p,
          baseRevision: p.revision,
          ...(kind === "place"
            ? { place: next }
            : {
                cast: (p.cast || []).some((c) => c.id === d.id)
                  ? p.cast.map((c) => (c.id === d.id ? next : c))
                  : [...(p.cast || []), next],
              }),
        }),
      });
      libraryDraft = null;
      dirty = false;
      await refresh();
      notify(
        "Reference version saved. Prepared shots retain their original sources.",
      );
    }),
  );
  document.querySelector("#selected-take")?.addEventListener(
    "change",
    guarded(async (e) => {
      if (!e.target.value) return;
      if (dirty) throw new Error("Save the shot before choosing a take.");
      const p = production();
      await api("/api/productions/" + p.id + "/take", {
        method: "POST",
        body: JSON.stringify({
          baseRevision: p.revision,
          shotId: shot().id,
          jobId: e.target.value,
        }),
      });
      previewJobId = null;
      await refresh();
      notify("This exact take is selected for the cut.");
    }),
  );
  document.querySelector('#reuse-take')?.addEventListener('change',guarded(async e=>{
    if(!e.target.value)return;if(dirty)throw Error('Save the shot before reusing footage.');
    const p=production();await api('/api/productions/'+p.id+'/reuse-take',{method:'POST',body:JSON.stringify({baseRevision:p.revision,shotId:shot().id,sourceJobId:e.target.value})});
    previewJobId=null;await refresh();notify('Existing footage selected. No generation charge.');
  }));
  document
    .querySelectorAll("[data-nav]")
    .forEach((b) => (b.onclick = () => go(b.dataset.nav)));
  document
    .querySelectorAll("[data-shot]")
    .forEach((b) => (b.onclick = () => selectShot(b.dataset.shot)));
  document
    .querySelector("[data-projects]")
    ?.addEventListener("click", () => go("projects"));
  document.querySelectorAll("[data-project]").forEach(
    (b) =>
      (b.onclick = () => {
        projectId = b.dataset.project;
        localStorage.setItem("shutter.project", projectId);
        shotId = null;
        go("film");
      }),
  );
  document.querySelectorAll("[data-open-job]").forEach(
    (b) =>
      (b.onclick = () => {
        const j = data.jobs.find((j) => j.id === b.dataset.openJob);
        projectId = j.projectId;
        shotId = j.shotId;
        previewJobId = j.id;
        go("film");
      }),
  );
  document.querySelector("#shot-form")?.addEventListener("input", () => {
    dirty = true;
  });
  document
    .querySelector("#shot-form")
    ?.addEventListener("submit", guarded(saveShot));
  document
    .querySelector("#prepare")
    ?.addEventListener("click", guarded(prepare));
  document.querySelector("#run-job")?.addEventListener(
    "click",
    guarded(async () => {
      await api("/api/jobs/" + latest(shot()).id + "/run", {
        method: "POST",
        body: "{}",
      });
      await refresh();
      notify("Render submitted. Its receipt and budget reservation are saved.");
    }),
  );
  document
    .querySelector("#play-sequence")
    ?.addEventListener("click", playSequence);
  document.querySelector("#review-form")?.addEventListener("input", () => {
    dirty = true;
    document.querySelector('#review-form').dataset.changed='true';
  });
  document.querySelector("#review-form")?.addEventListener(
    "submit",
    guarded(async (e) => {
      const decisionDraft=document.querySelector('#decision-note')?.value;
      const hasDecisionDraft=decisionDraft!==undefined&&decisionDraft!==(flow.takeState(takeFor(shot()))?.lastDecision?.note||'');
      await api("/api/jobs/" + takeFor(shot()).id + "/review", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
      });
      dirty = false;
      await refresh();
      if(hasDecisionDraft&&document.querySelector('#decision-note')){document.querySelector('#decision-note').value=decisionDraft;dirty=true;}
      notify("Review saved to this exact video take.");
    }),
  );
  document.querySelector("#use-current")?.addEventListener("click", () => {
    momentAsset = asset(shot().reference);
    momentDraft.reference = momentAsset.id;
    saveMomentDraft();
    render();
  });
  document.querySelector("#change-moment")?.addEventListener("click", () => {
    momentAsset = null;
    delete momentDraft.reference;
    saveMomentDraft();
    render();
  });
  document.querySelector("#moment-file")?.addEventListener(
    "change",
    guarded(async (e) => {
      const file = e.target.files[0];
      if (file) {
        momentAsset = await api(
          "/api/assets?name=" + encodeURIComponent(file.name),
          { method: "POST", body: file, raw: true },
        );
        momentDraft.reference = momentAsset.id;
        saveMomentDraft();
      }
      await refresh();
    }),
  );
  document.querySelector("#moment-form")?.addEventListener("input", () => {
    momentDraft = {
      ...momentDraft,
      action: document.querySelector("#moment-action").value,
      title: document.querySelector("#moment-title").value,
    };
    saveMomentDraft();
  });
  document.querySelector("#moment-form")?.addEventListener(
    "submit",
    guarded(async () => {
      const action = document.querySelector("#moment-action").value.trim();
      if (!action) throw new Error("Describe the moment before preparing it.");
      const p = await api("/api/productions", {
        method: "POST",
        body: JSON.stringify({
          title: document.querySelector("#moment-title").value,
          subtitle: "Moment",
          style: "Preserve the input image’s visual style.",
          cast: [],
          place: {},
          shots: [
            {
              id: "moment",
              title: "A single moment",
              action,
              camera: "Keep the source composition; subtle controlled motion.",
              reference: momentAsset.id,
              cast: [],
              width: 768,
              height: 512,
              frames: 121,
              fps: 24,
              seed: Math.floor(Math.random() * 1000000),
            },
          ],
        }),
      });
      projectId = p.id;
      localStorage.setItem("shutter.project", projectId);
      shotId = "moment";
      localStorage.setItem("shutter.shot", shotId);
      view = "film";
      dirty = false;
      momentAsset = null;
      momentDraft = {};
      saveMomentDraft();
      await refresh();
      await prepare();
    }),
  );
  document.querySelector("#add-shot")?.addEventListener(
    "click",
    guarded(async () => {
      if (dirty)
        throw new Error("Save the current shot before adding another.");
      const p = production(),
        source = shot();
      const id = "shot_" + crypto.randomUUID().slice(0, 8);
      const next = {
        ...p,
        baseRevision: p.revision,
        shots: [
          ...p.shots,
          {
            ...(source || {
              width: 768,
              height: 512,
              frames: 121,
              fps: 24,
              seed: 1,
            }),
            id,
            selectedTake: null,
            title: "New shot",
            action: "",
            before: source?.after || "",
            after: "",
          },
        ],
      };
      await api("/api/productions/" + p.id, {
        method: "PUT",
        body: JSON.stringify(next),
      });
      shotId = id;
      await refresh();
    }),
  );
}
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
await refresh();
setInterval(() => {
  if (!busy && !dirty && !playing) refresh();
}, 6000);
