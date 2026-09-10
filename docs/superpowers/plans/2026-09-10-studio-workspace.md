# Shutter Studio Workspace Implementation Plan

> **For agentic workers:** Use executing-plans for inline task-by-task execution. Steps use checkbox syntax for tracking.

**Goal:** A coherent directing room, working reference canvas and editing workspace sharing one production.

**Architecture:** Keep the existing browser modules and Node/SQLite studio. Add a small canvas state service and UI module. References continue to live in production shots; canvas placement is a separate revisioned record.

**Tech Stack:** Node 24, native SQLite, browser JavaScript, CSS, existing local FFmpeg export.

**Spec:** docs/studio-workspace-design.md

## Global Constraints

- No paid generation in this milestone.
- Direct, Canvas and Edit share existing shots, references, takes and saved timeline.
- No simulated chat agent, fake waveforms, provider additions or framework migration.
- Preserve earlier working tree changes and study footage.

### 1. Reference graph persistence and production bindings

Files: src/canvas.mjs, src/server.mjs, src/store.mjs, test/canvas.test.mjs.

Interfaces: getCanvas(studio, projectId) returns revision, positions and canonical shot bindings. saveCanvas(studio, projectId, baseRevision, positions) validates finite coordinates 0..10000 and saves using a transaction. connectReference(studio, projectId, {baseRevision, shotId, assetId, role, description, remove}) returns the saved production.

- [x] Write HTTP and store tests: connect audio reference in reference mode, prepare and assert snapshot binding; reject video opening frame, unsupported roles and stale revision; verify previous snapshot immutable and layout survives reopening.
- [x] Confirm the test fails before implementation.
- [x] Implement role mapping: opening -> shot.reference, ending -> shot.endReference, reference -> shot.extraReferences. Image mode accepts opening/ending images; reference mode accepts opening composition and additional image/video/audio references. Text mode rejects references. Validate the completed snapshot before saving. Removing mandatory visual input cannot silently create an invalid prepared shot.
- [x] Run node --test test/canvas.test.mjs.

### 2. Studio shell and real creative views

Files: public/app.js, public/direct.js, public/canvas.js, public/studio.css, public/index.html, public/timeline.js, src/server.mjs static routes.

- [x] Preserve the existing film view as shot settings. Direct renders selected footage, a saved direction form and shot strip; form submission calls PUT /api/productions/:id with baseRevision.
- [x] Build canvas nodes from getCanvas bindings, actual assets, saved take and cut. Connect via draggable ports or labelled form calling POST /api/productions/:id/connections. Import uses POST /api/assets. Drag/arrow node movement saves layout using PUT /canvas. Refresh data after successful production changes.
- [x] Introduce three primary views with reloadable hash navigation; keep secondary tools in a compact library menu. Apply the visual system and responsive layout to Direct, Canvas and Edit.
- [x] Check navigation, save/reopen, connection and layout actions in the rendered browser, plus desktop/narrow layouts and browser errors. Run the existing cheap test suite once at the integration gate.

### 3. Preserve the result

- [x] Save research/adoption notes and observed verification in the current checkpoint and task outputs. Confirm generation job count and budget unchanged. Restore any study edits made during browser verification.
