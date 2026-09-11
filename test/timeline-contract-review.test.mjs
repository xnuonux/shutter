/**
 * Verification-only audit of the pinned Shutter compiler.
 * These fixtures do not exercise SQLite, the browser, decoders, exports or providers.
 * No paid requests, network access, user media or application mutations occur.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTimeline } from '../src/timeline.mjs';

const FPS = 24;
const clip = (id, jobId, sourceIn, sourceOut, at) => ({
  id, jobId, sourceIn, sourceOut, ...(at === undefined ? {} : { at }),
});
function fixture(count = 5, frames = 360) {
  const verified = [];
  const jobs = new Map(Array.from({ length: count }, (_, i) => {
    const id = `job_${i}`;
    return [id, { id, projectId: 'p', shotId: `shot_${i}`, state: 'ready',
      output: `asset_${i}`, media: { fps: FPS, frames, width: 1920, height: 1080, audioStreams: i < 4 ? 1 : 0 } }];
  }));
  const studio = {
    getJob(id) { if (!jobs.has(id)) throw Error('not_found'); return jobs.get(id); },
    getProduction(id) { assert.equal(id, 'p'); return { title: 'Audit fixture' }; },
    verifyAsset(id) { verified.push(id); return { id, sha256: `fixture_digest_${id}` }; },
  };
  return { studio, jobs, verified };
}
function canonical() {
  return { fps: FPS, main: Array.from({ length: 4 }, (_, i) => clip(`main_${i}`, `job_${i}`, 0, 360)),
    coverage: [clip('alt', 'job_4', 0, 72, 336)] };
}
const compact = p => p.videoSegments.map(({ clipId, at, sourceIn, sourceOut }) => ({ clipId, at, sourceIn, sourceOut }));

test('60-second coverage: scene 14–17 returns at source second 2 of main take 2', () => {
  const { studio } = fixture();
  const p = compileTimeline(studio, 'p', canonical());
  assert.equal(p.frames, 60 * FPS);
  assert.deepEqual(compact(p), [
    { clipId: 'main_0', at: 0, sourceIn: 0, sourceOut: 336 },
    { clipId: 'alt', at: 336, sourceIn: 0, sourceOut: 72 },
    { clipId: 'main_1', at: 408, sourceIn: 48, sourceOut: 360 },
    { clipId: 'main_2', at: 720, sourceIn: 0, sourceOut: 360 },
    { clipId: 'main_3', at: 1080, sourceIn: 0, sourceOut: 360 },
  ]);
});

test('coverage preserves all four main audio ranges and main-scene policy', () => {
  const { studio } = fixture();
  const p = compileTimeline(studio, 'p', canonical());
  assert.equal(p.audioPolicy, 'main-scene');
  assert.equal(p.audioStreams, 1);
  assert.deepEqual(p.audioSegments.map(s => [s.jobId, s.at, s.sourceIn, s.sourceOut]),
    Array.from({ length: 4 }, (_, i) => [`job_${i}`, i * 360, 0, 360]));
});

test('removing coverage restores the original four ranges', () => {
  const { studio } = fixture(); const t = canonical(); t.coverage = [];
  const p = compileTimeline(studio, 'p', t);
  assert.equal(p.frames, 1440);
  assert.deepEqual(p.videoSegments.map(s => [s.clipId, s.sourceIn, s.sourceOut]),
    Array.from({ length: 4 }, (_, i) => [`main_${i}`, 0, 360]));
});

test('trimmed main sources resume at their true offset after coverage', () => {
  const { studio } = fixture();
  const t = { fps: FPS, main: [clip('m', 'job_0', 50, 250)], coverage: [clip('c', 'job_4', 10, 30, 20)] };
  const p = compileTimeline(studio, 'p', t);
  assert.deepEqual(compact(p), [
    { clipId: 'm', at: 0, sourceIn: 50, sourceOut: 70 },
    { clipId: 'c', at: 20, sourceIn: 10, sourceOut: 30 },
    { clipId: 'm', at: 40, sourceIn: 90, sourceOut: 250 },
  ]);
});

test('one-frame coverage at the scene end has no gap or extra frame', () => {
  const { studio } = fixture(); const t = canonical(); t.coverage = [clip('last', 'job_4', 20, 21, 1439)];
  const p = compileTimeline(studio, 'p', t);
  assert.equal(p.frames, 1440); assert.equal(p.videoSegments.at(-1).at, 1439);
  assert.equal(p.videoSegments.at(-1).frames, 1);
});

test('adjacent coverage intervals are allowed and sorted', () => {
  const { studio } = fixture(); const t = canonical();
  t.coverage = [clip('c2', 'job_4', 24, 48, 48), clip('c1', 'job_4', 0, 24, 24)];
  assert.deepEqual(compileTimeline(studio, 'p', t).videoSegments.filter(s => s.clipId.startsWith('c')).map(s => s.clipId), ['c1', 'c2']);
});

test('overlapping and out-of-scene coverage are rejected', () => {
  const { studio } = fixture(); const t = canonical();
  t.coverage = [clip('c1', 'job_4', 0, 48, 0), clip('c2', 'job_4', 0, 48, 24)];
  assert.throws(() => compileTimeline(studio, 'p', t), /timeline_coverage_overlap/);
  t.coverage = [clip('c3', 'job_4', 0, 48, 1430)];
  assert.throws(() => compileTimeline(studio, 'p', t), /timeline_coverage_outside_scene/);
});

test('source ranges reject negative, empty, fractional, and beyond-source values', () => {
  for (const [sourceIn, sourceOut] of [[-1, 10], [10, 10], [0.5, 10], [0, 361]]) {
    const { studio } = fixture();
    assert.throws(() => compileTimeline(studio, 'p', { fps: FPS, main: [clip('m', 'job_0', sourceIn, sourceOut)], coverage: [] }), /timeline_source_range/);
  }
});

test('duplicate clip identities are rejected across main and coverage', () => {
  const { studio } = fixture(); const t = canonical(); t.coverage[0].id = 'main_0';
  assert.throws(() => compileTimeline(studio, 'p', t), /timeline_clip_identity/);
});

test('another production and non-ready jobs cannot become timeline sources', () => {
  for (const changes of [{ projectId: 'other' }, { state: 'rendering' }]) {
    const { studio, jobs } = fixture(); Object.assign(jobs.get('job_0'), changes);
    assert.throws(() => compileTimeline(studio, 'p', canonical()), /timeline_ready_take_required/);
  }
});

test('asset integrity failures propagate and do not produce a successful plan', () => {
  const { studio } = fixture(); studio.verifyAsset = () => { throw Error('asset_integrity'); };
  assert.throws(() => compileTimeline(studio, 'p', canonical()), /asset_integrity/);
});

test('same source job placed twice is verified once within a compile', () => {
  const { studio, verified } = fixture();
  const t = { fps: FPS, main: [clip('a', 'job_0', 0, 24), clip('b', 'job_0', 24, 48)], coverage: [] };
  assert.equal(compileTimeline(studio, 'p', t).takes.length, 1);
  assert.equal(verified.length, 1);
});

test('compiler does not mutate the input timeline or job records', () => {
  const { studio, jobs } = fixture(); const t = canonical();
  const before = JSON.stringify({ t, jobs: [...jobs] }); compileTimeline(studio, 'p', t);
  assert.equal(JSON.stringify({ t, jobs: [...jobs] }), before);
});

test('current limitations are explicit: empty timelines and fractional project fps fail', () => {
  const { studio } = fixture();
  assert.throws(() => compileTimeline(studio, 'p', { fps: FPS, main: [], coverage: [] }), /timeline_invalid/);
  const t = canonical(); t.fps = 24000 / 1001;
  assert.throws(() => compileTimeline(studio, 'p', t), /timeline_invalid/);
});

test('mismatched source frame rate fails rather than silently retiming', () => {
  const { studio, jobs } = fixture(); jobs.get('job_0').media.fps = 30;
  assert.throws(() => compileTimeline(studio, 'p', canonical()), /timeline_frame_rate_mismatch/);
});

test('100 seeded fixtures match an independent per-frame coverage oracle', () => {
  let seed = 20260910;
  const random = n => { seed = (1664525 * seed + 1013904223) >>> 0; return seed % n; };
  for (let run = 0; run < 100; run++) {
    const { studio } = fixture(8, 500);
    const main = Array.from({ length: 1 + random(5) }, (_, i) => {
      const begin = random(30); return clip(`m${i}`, `job_${i}`, begin, begin + 20 + random(100));
    });
    const total = main.reduce((n, c) => n + c.sourceOut - c.sourceIn, 0);
    const coverage = []; let at = random(5);
    while (at < total) {
      const length = Math.min(1 + random(20), total - at), begin = random(40);
      coverage.push(clip(`c${coverage.length}`, 'job_7', begin, begin + length, at));
      at += length + random(20);
    }
    const p = compileTimeline(studio, 'p', { fps: FPS, main, coverage: [...coverage].reverse() });
    assert.equal(p.frames, total);
    const actual = p.videoSegments.flatMap(s => Array.from({ length: s.frames }, (_, i) => [s.jobId, s.sourceIn + i]));
    const oracle = main.flatMap(c => Array.from({ length: c.sourceOut - c.sourceIn }, (_, i) => [c.jobId, c.sourceIn + i]));
    for (const c of coverage) for (let i = 0; i < c.sourceOut - c.sourceIn; i++) oracle[c.at + i] = [c.jobId, c.sourceIn + i];
    assert.deepEqual(actual, oracle, `fixture ${run}`);
    assert.equal(p.audioSegments.reduce((n, s) => n + s.frames, 0), total);
  }
});
