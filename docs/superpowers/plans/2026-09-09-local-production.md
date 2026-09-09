# Shutter local production implementation plan

> Execute inline in this task. Dom authorized the scoped build, free setup and local experiments; no repeated approval ceremony. The initial GPU startup hold was resolved by explicit user confirmation, and the three local renders completed.

**Goal:** An actual local production workbench that preserves references, prepares and reconciles local video jobs, and supports Moment and continuity review.

**Architecture:** Node 24 loopback service, native SQLite journal, immutable local media, native ComfyUI workflows and a small browser application. Reference and shot state belongs to Shutter; the renderer is replaceable.

**Tech stack:** Node built-ins, browser ES modules, installed ComfyUI/Wan, built-in image generation, optional separately qualified Blender/FFmpeg.

**Spec:** ../../2026-09-09-direction.md

## Constraints

No spend, no subagents, no customer migration, no production changes. Existing models are reused. New assets and outputs remain local. Do not label unrendered boards as videos or retry ambiguous submissions.

## 1. Recoverable production and actual reference binding

Create `src/store.mjs`, `src/workflow.mjs`, `test/production.test.mjs`, `workflows/wan22.json`.

Domain: `Studio(root)` exposes `importAsset(bytes, metadata)`, `createProduction(input)`, `getProduction(id)`, `saveProduction(id, baseRevision, next)`, `prepareJob(projectId, shotId, requestKey)`, `getJob(id)`, `listJobs()` and `updateJob(id, patch)`.

- [x] Write failing tests for revision conflict, immutable job snapshot, idempotency conflict, image byte integrity, foreign/missing reference and the native start-image binding.
- [x] Run `node --test test/production.test.mjs` and observe the missing behavior.
- [x] Implement SQLite transactions and exact workflow compilation; unsupported dimensions/frames must throw before submission.
- [x] Run the same targeted tests once after implementation; repair observed failures.

## 2. Render lifecycle through the real caller

Create `src/renderer.mjs`, `src/server.mjs`, `test/server.test.mjs`.

`Renderer(studio, {baseUrl, fetch})` submits an exact prepared job only after local health succeeds, uploads the selected frame, persists provider ID and reconciles output. `createServer({studio, renderer})` serves the real UI and JSON commands. User-triggered retries of unknown submissions reconcile rather than duplicate.

- [x] Test against a controlled local HTTP provider which records actual upload and submitted graph; failed health must not report a render started.
- [x] Implement exact-job polling, verified local output registration, safe local routes and request limits.
- [x] Exercise duplicate submissions, reconnect and a lost acknowledgement through the actual HTTP adapter. Out-of-order recovery was not separately qualified in this serial GPU slice.

## 3. The visible product and evidence

Create `public/index.html`, `public/app.js`, `public/style.css`, `tools/seed.mjs`, `README.md`, `THIRD_PARTY.md`.

- [x] Seed the original character/set references and three shots with accurate image-generation provenance.
- [x] Build production, Moment, shot editing, job state, comparison/review and real review-cut export around the same API; provide a separate source/media snapshot tool.
- [x] Launch the loopback workbench; inspect rendered layout and exercise save/reload, preparation and offline behavior in a browser.
- [x] Once the ComfyUI startup hold is resolved, render the three exact jobs, decode/probe outputs, inspect start/middle/end and record timing plus continuity issues.
- [x] Preserve the working repository, research decisions, generated assets and precise outstanding holds. No claim of a finished competitive studio until its broader gates are earned.

## Recorded additions and remaining gates

The completed slice also includes an actual Blender blockout with three physical cameras and geometry passes, a tested local stdio MCP bridge, and a decoded 15.125-second review cut. Full-motion continuity approval, audio, Ref2VA conditioning, interactive Blender control and long-episode qualification remain open. See `../../current-checkpoint.md` for evidence and the H3 license/performance decision.
