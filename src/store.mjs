import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {validateH3,h3Snapshot} from './h3-spec.mjs';
import {compileTimeline} from './timeline.mjs';

export const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const clone = (value) => JSON.parse(JSON.stringify(value));
const bounded = (value, max = 4000) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export const fingerprint = (value) => digest(JSON.stringify(canonical(value)));

export class Studio {
  constructor(root) {
    this.root = path.resolve(root);
    fs.mkdirSync(path.join(this.root, "assets"), { recursive: true });
    this.db = new DatabaseSync(path.join(this.root, "studio.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests(key TEXT PRIMARY KEY, hash TEXT NOT NULL, job_id TEXT NOT NULL);",
    );
  }
  close() {
    this.db.close();
  }
  read(id, kind) {
    const row = this.db
      .prepare("SELECT kind,payload FROM records WHERE id=?")
      .get(id);
    if (!row || (kind && row.kind !== kind)) throw new Error("not_found");
    return JSON.parse(row.payload);
  }
  write(kind, value) {
    this.db
      .prepare(
        "INSERT INTO records(id,kind,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(value.id, kind, JSON.stringify(value));
    return clone(value);
  }
  list(kind) {
    return this.db
      .prepare("SELECT payload FROM records WHERE kind=? ORDER BY rowid")
      .all(kind)
      .map((r) => JSON.parse(r.payload));
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  importAsset(bytes, metadata = {}) {
    bytes = Buffer.from(bytes);
    if (!bytes.length || bytes.length > 256 * 1024 * 1024)
      throw new Error("asset_size");
    const isPng = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const isMp4 = bytes.subarray(4, 8).toString() === "ftyp";
    const isWav=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WAVE';
    const isMp3=bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224&&!isJpeg);
    const ext = isPng ? "png" : isJpeg ? "jpg" : isMp4 ? "mp4" : isWav?'wav':isMp3?'mp3':null;
    if (!ext) throw new Error("unsupported_media");
    const sha256 = digest(bytes),
      id = "asset_" + sha256;
    try {
      const existing = this.read(id, "asset");
      this.verifyAsset(id);
      return existing;
    } catch (e) {
      if (e.message !== "not_found") throw e;
    }
    const filename = sha256 + "." + ext;
    const destination = path.join(this.root, "assets", filename);
    if (fs.existsSync(destination)) {
      if (digest(fs.readFileSync(destination)) !== sha256)
        throw new Error("asset_integrity");
    } else fs.writeFileSync(destination, bytes, { flag: "wx" });
    return this.write("asset", {
      id,
      sha256,
      filename,
      bytes: bytes.length,
      kind: isMp4 ? "video" : isWav||isMp3?'audio':"image",
      mime: isMp4 ? "video/mp4" : isWav?'audio/wav':isMp3?'audio/mpeg':isPng ? "image/png" : "image/jpeg",
      name: bounded(metadata.name || filename, 200),
      origin: bounded(metadata.origin || "local import", 1000),
      createdAt: new Date().toISOString(),
    });
  }
  assetPath(id) {
    const a = this.read(id, "asset");
    return path.join(this.root, "assets", a.filename);
  }
  verifyAsset(id) {
    const asset = this.read(id, "asset");
    if (
      !fs.existsSync(this.assetPath(id)) ||
      digest(fs.readFileSync(this.assetPath(id))) !== asset.sha256
    )
      throw new Error("asset_integrity");
    return asset;
  }
  validateProduction(input) {
    if (!bounded(input.title, 200)) throw new Error("title_required");
    if (!Array.isArray(input.shots) || input.shots.length > 1000)
      throw new Error("invalid_shots");
    const cast = input.cast || [],
      castIds = new Set();
    if (!Array.isArray(cast) || cast.length > 128)
      throw new Error("invalid_cast");
    for (const person of cast) {
      if (
        !/^[a-zA-Z0-9_-]{1,80}$/.test(person.id) ||
        castIds.has(person.id) ||
        !bounded(person.name, 200)
      )
        throw new Error("invalid_cast_identity");
      castIds.add(person.id);
      if (
        !person.reference ||
        this.read(person.reference, "asset").kind !== "image"
      )
        throw new Error("cast_image_required");
    }
    if (
      input.place?.reference &&
      this.read(input.place.reference, "asset").kind !== "image"
    )
      throw new Error("image_required");
    const ids = new Set();
    for (const shot of input.shots) {
      validateH3(this,shot,cast);
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(shot.id) || ids.has(shot.id))
        throw new Error("invalid_shot_identity");
      ids.add(shot.id);
      if (
        !Number.isInteger(shot.frames) ||
        shot.frames < 1 ||
        !Number.isFinite(shot.fps) ||
        shot.fps <= 0
      )
        throw new Error("invalid_timing");
      if (shot.reference && this.read(shot.reference, "asset").kind !== "image")
        throw new Error("image_required");
      if (
        !Array.isArray(shot.cast || []) ||
        (shot.cast || []).some((id) => !castIds.has(id))
      )
        throw new Error("cast_reference_missing");
      if (shot.selectedTake) {
        const take = this.getJob(shot.selectedTake);
        if (
          take.projectId !== input.id ||
          take.shotId !== shot.id ||
          take.state !== "ready" ||
          !take.output
        )
          throw new Error("ready_take_required");
      }
    }
    const result = { ...clone(input), title: bounded(input.title, 200) };
    delete result.baseRevision;
    return result;
  }
  createProduction(input) {
    const value = this.validateProduction({
      ...input,
      id: "prod_" + crypto.randomUUID(),
    });
    return this.write("production", {
      ...value,
      revision: 1,
      createdAt: new Date().toISOString(),
    });
  }
  getProduction(id) {
    return this.read(id, "production");
  }
  saveProduction(id, baseRevision, next) {
    return this.transaction(() => {
      const current = this.getProduction(id);
      if (current.revision !== baseRevision)
        throw new Error("revision_conflict");
      return this.write("production", {
        ...this.validateProduction({ ...next, id }),
        revision: current.revision + 1,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      });
    });
  }
  selectTake(projectId, baseRevision, shotId, jobId) {
    const p = this.getProduction(projectId),
      job = this.getJob(jobId);
    if (
      job.projectId !== projectId ||
      job.shotId !== shotId ||
      job.state !== "ready" ||
      !job.output
    )
      throw new Error("ready_take_required");
    this.verifyAsset(job.output);
    return this.saveProduction(projectId, baseRevision, {
      ...p,
      shots: p.shots.map((s) =>
        s.id === shotId ? { ...s, selectedTake: jobId } : s,
      ),
    });
  }
  prepareJob(projectId, shotId, requestKey) {
    if (!bounded(requestKey, 200) || requestKey.length > 200)
      throw new Error("request_key_required");
    const p = this.getProduction(projectId),
      shot = p.shots.find((s) => s.id === shotId);
    if (!shot || (!shot.reference&&!shot.generation)) throw new Error("reference_required");
    const h3=shot.generation?h3Snapshot(this,p,shot):null;
    const refs = [
      ...new Set(
        [
          shot.reference,
          p.place?.reference,
          ...(p.cast || [])
            .filter((c) => (shot.cast || []).includes(c.id))
            .map((c) => c.reference),
        ].filter(Boolean),
      ),
    ].map((id) => this.verifyAsset(id));
    const snapshot = {
      projectId,
      projectRevision: p.revision,
      title: p.title,
      style: p.style || "",
      cast: (p.cast || []).filter((c) => (shot.cast || []).includes(c.id)),
      place: p.place || {},
      shot: clone(shot),
      references: refs,
      workflow: "wan22-ti2v-5b-i2v-v1",
      ...(h3||{}),
    };
    const hash = fingerprint(snapshot),
      key = projectId + ":" + requestKey;
    return this.transaction(() => {
      const previous = this.db
        .prepare("SELECT hash,job_id FROM requests WHERE key=?")
        .get(key);
      if (previous) {
        if (previous.hash !== hash) throw new Error("request_conflict");
        return this.getJob(previous.job_id);
      }
      const job = {
        id: "job_" + crypto.randomUUID(),
        projectId,
        shotId,
        requestKey,
        specHash: hash,
        snapshot,
        state: "prepared",
        providerId: null,
        output: null,
        review: null,
        createdAt: new Date().toISOString(),
      };
      this.write("job", job);
      this.db
        .prepare("INSERT INTO requests(key,hash,job_id) VALUES(?,?,?)")
        .run(key, hash, job.id);
      return job;
    });
  }
  getJob(id) {
    return this.read(id, "job");
  }
  listJobs() {
    return this.list("job");
  }
  updateJob(id, patch) {
    return this.write("job", {
      ...this.getJob(id),
      ...clone(patch),
      id,
      updatedAt: new Date().toISOString(),
    });
  }
  claimJob(id) {
    return this.transaction(() => {
      const job = this.getJob(id);
      if (job.state !== "prepared") return null;
      const active = this.listJobs().find((j) =>
        ["submitting", "rendering", "verifying", "unknown"].includes(j.state),
      );
      if (active) throw new Error("renderer_busy");
      return this.updateJob(id, {
        state: "submitting",
        startedAt: new Date().toISOString(),
        error: null,
      });
    });
  }
  reviewJob(id, review) {
    const job = this.getJob(id);
    if (job.state !== "ready" || !job.output)
      throw new Error("render_required_for_review");
    const criteria = ["face", "costume", "set", "light", "motion", "story"];
    if (
      !criteria.every((c) => ["pass", "revise", "unseen"].includes(review[c]))
    )
      throw new Error("incomplete_review");
    return this.updateJob(id, {
      review: {
        ...Object.fromEntries(criteria.map((c) => [c, review[c]])),
        note: bounded(review.note, 2000),
        outputDigest: this.read(job.output, "asset").sha256,
        reviewedAt: new Date().toISOString(),
      },
    });
  }
  reuseTake(projectId,baseRevision,shotId,sourceId) {
    return this.transaction(()=>{
      const p=this.getProduction(projectId),source=this.getJob(sourceId);
      if(p.revision!==baseRevision)throw Error('revision_conflict');
      const shot=p.shots.find(s=>s.id===shotId);if(!shot)throw Error('shot_not_found');
      if(source.state!=='ready'||!source.output)throw Error('ready_take_required');
      this.verifyAsset(source.output);
      const job=this.write('job',{id:'job_'+crypto.randomUUID(),projectId,shotId,state:'ready',providerId:null,sourceJobId:source.id,output:source.output,media:source.media||source.snapshot.shot,review:source.review||null,createdAt:new Date().toISOString(),snapshot:{...clone(source.snapshot),workflow:'reused-take',sourceWorkflow:source.snapshot.workflow}});
      shot.selectedTake=job.id;
      this.write('production',{...p,revision:p.revision+1,updatedAt:new Date().toISOString()});return job;
    });
  }
  buildCutPlan(id) {
    let record;
    try {record=this.read('timeline_'+id,'timeline');}
    catch(e){if(e.message!=='not_found')throw e;}
    if(record)return this.timelinePlan(id,record.timeline);
    return this.buildSelectedCutPlan(id);
  }
  timelinePlan(id,timeline) {
    const plan=compileTimeline(this,id,timeline);
    return {...plan,hash:fingerprint(plan)};
  }
  getTimeline(id) {
    let record;
    try {record=this.read('timeline_'+id,'timeline');}
    catch(e){
      if(e.message!=='not_found')throw e;
      const plan=this.buildSelectedCutPlan(id);
      record={id:'timeline_'+id,projectId:id,revision:0,timeline:{fps:plan.fps,
        main:plan.takes.map((t,i)=>({id:'main_'+i,jobId:t.jobId,sourceIn:0,sourceOut:t.frames})),coverage:[]},past:[],future:[]};
    }
    return {...record,plan:this.timelinePlan(id,record.timeline)};
  }
  saveTimeline(id,baseRevision,timeline,action='save') {
    return this.transaction(()=>{
      const current=this.getTimeline(id);
      if(current.revision!==baseRevision)throw Error('revision_conflict');
      let next=clone(timeline||current.timeline),past=current.past,future=current.future;
      if(action==='undo'){
        if(!past.length)throw Error('timeline_no_undo');next=past.at(-1);past=past.slice(0,-1);future=[current.timeline,...future];
      }else if(action==='redo'){
        if(!future.length)throw Error('timeline_no_redo');next=future[0];future=future.slice(1);past=[...past,current.timeline];
      }else{past=[...past,current.timeline].slice(-100);future=[];}
      const plan=this.timelinePlan(id,next);
      const record=this.write('timeline',{id:current.id,projectId:id,revision:current.revision+1,timeline:next,past,future,hash:plan.hash,updatedAt:new Date().toISOString()});
      return {...record,plan};
    });
  }
  undoTimeline(id,baseRevision){return this.saveTimeline(id,baseRevision,null,'undo');}
  redoTimeline(id,baseRevision){return this.saveTimeline(id,baseRevision,null,'redo');}
  buildSelectedCutPlan(id) {
    const production = this.getProduction(id);
    if (!production.shots.length) throw new Error("selected_takes_required");
    const takes = production.shots.map((shot) => {
      if (!shot.selectedTake) throw new Error("selected_takes_required");
      const job = this.getJob(shot.selectedTake);
      if (
        job.projectId !== id ||
        job.shotId !== shot.id ||
        job.state !== "ready" ||
        !job.output
      )
        throw new Error("ready_take_required");
      const asset = this.verifyAsset(job.output),
        profile = job.media || job.snapshot.shot;
      return {
        shotId: shot.id,
        jobId: job.id,
        assetId: asset.id,
        sha256: asset.sha256,
        width: profile.width,
        height: profile.height,
        frames: profile.frames,
        fps: profile.fps,
        audioStreams: profile.audioStreams || 0,
      };
    });
    const first = takes[0];
    if (
      takes.some(
        (t) =>
          t.fps !== first.fps,
      )
    )
      throw new Error("cut_format_mismatch");
    return {
      projectId: id,
      title: production.title,
      takes,
      width: Math.max(...takes.map(t=>t.width)),
      height: Math.max(...takes.map(t=>t.height)),
      fps: first.fps,
      frames: takes.reduce((sum, t) => sum + t.frames, 0),
      audioStreams: takes.some(t=>t.audioStreams>0)?1:0,
      hash: fingerprint({ version: 2, takes,fit:'contain',audio:'stereo-48000-picture-duration' }),
    };
  }
  exportProduction(id) {
    const production = this.getProduction(id);
    const jobs = this.listJobs().filter((j) => j.projectId === id);
    const stages = this.list("stage").filter((s) => s.projectId === id);
    const cuts = this.list("cut").filter((c) => c.projectId === id);
    const refs = new Set(
      [
        ...production.shots.map((s) => s.reference),
        ...production.shots.flatMap(s=>[s.endReference,s.location?.reference,...(s.characterStates||[]).map(c=>c.reference),...(s.extraReferences||[]).map(r=>r.assetId)]),
        ...(production.cast || []).map((c) => c.reference),
        production.place?.reference,
        ...jobs.map((j) => j.output),
        ...jobs.flatMap(j=>[j.reviewFrames?.first,j.reviewFrames?.last]),
        ...jobs.flatMap((j) => j.snapshot.references.map((a) => a.id)),
        ...stages.flatMap((s) => s.views.map((v) => v.reference)),
        ...cuts.map((c) => c.output),
      ].filter(Boolean),
    );
    return {
      format: "shutter-production-v1",
      production,
      jobs,
      stages,
      cuts,
      timeline: this.list('timeline').find(t=>t.projectId===id)||null,
      canvas: this.list('canvas').find(c=>c.projectId===id)||null,
      assets: [...refs].map((id) => this.verifyAsset(id)),
      exportedAt: new Date().toISOString(),
    };
  }
}
