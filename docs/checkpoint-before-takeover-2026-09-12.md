# Current checkpoint: Direct, Canvas and Edit

September 10, 2026. Read studio-workspace-results.md and studio-workspace-design.md. Dom requested a beautiful, understandable studio with a connected media canvas and usable editing. Implemented the bounded redesign inline, preserving earlier work and provider choices. 41 tests pass. Browser verified direction save/reopen, real reference wire connection, keyboard/pointer layout persistence, and responsive Direct/Canvas/Edit.

Production prod_ba9072b5-21f0-4973-b413-05678795ef46 is revision 20 after reversible verification saves. All original creative fields and seven selected takes are restored; same timeline revision 10 and 868-frame cut. Canvas revision 3 restores default positions. No new render jobs or paid charges: 20 jobs, zero active/unknown; tracked available $4.72154. Same existing renderer credentials; localhost4677 PID20908.

Direct is an editable direction composer; no simulated Pixel chat. Canvas connects actual next-take H3 media references and persists positions, with type/limit/revision validation. It is not a general workflow executor. Edit has real footage thumbnails and responsive tracks; preview remains exact local export. Next: faster preview and explicit take replacement that preserves trims/coverage, then sound controls and scene-state timing. Claude and additional providers remain deferred. No publication, merge, cleanup or new paid study in this milestone.

Task outputs/shutter/studio-workspace contains source/design notes, verification, production export and browser captures. Source recovery used the explicitly authorized old Lunari cinema path, not a migration repository warehouse. Full details and limitations in studio-workspace-results.md.

## Product architecture map · September 10, 2026

Dom asked to establish the full visual, functional and intuitive product picture. Read product-blueprint.md for the target, current gaps, Pixel/crew contracts and dependency-ordered milestones. This is a working blueprint for review; previous scene-time/coverage approval is preserved. Key decisions: one production across Direct/Canvas/Edit; canvas dependencies and timeline time remain distinct; media clips must not require a generation job; manual audiovisual editing and recovery precede deeper workflow/VFX expansion. Pixel uses shared typed commands and existing scoped authority. Native managed chat/providers remain deferred.

Next bounded milestone M1: asset-backed source placement, an editable draft before every shot has a selected render, stable preview and explicit source/take replacement. M2 completes import/edit/mix/title/caption/export/reopen. M3/M4 establish scene memory and Pixel operation. M5/M6 are workflow/craft expansion; they are not all prerequisites for a focused commercial beta. Product map is also saved in task outputs/shutter/product-blueprint/shutter-product-blueprint.md. This architecture pass changed documentation only; no new tests, media, API calls to providers or spending. Live local state remained20jobs,0active/unknown,$4.72154 tracked available.

## Historical checkpoint before the studio redesign

# Current checkpoint: shared scene timeline

September 10, 2026. Read timeline-foundation.md first. The approved scene-time design now has a working local editor, reversible frame ranges and coverage, main-scene audio, exact local preview/export and two MCP editing tools. 37 tests pass; browser placement/drag/trim/undo/redo/reopen checked.

Dom authorizes inline continuation and reuse of useful Lunari/GitHub code; stabilize fundamentals before adding another provider. Keep Claude integration deferred. Branch codex/shared-scene-timeline contains the existing working changes plus this milestone; no publication or cleanup.

Production prod_ba9072b5-21f0-4973-b413-05678795ef46 remains revision 16, seven original selected takes. Saved timeline revision 10 restores all original ranges, no coverage; 868 frames at 24 fps. Baseline cut cut_7d5bf063e5d90889bb547e2ad18f883a6a9c209a30601429d1e14ed51e606dec. Timing-test coverage cut cut_4e7771c36ffe99e4ba9dea7cfebaf75abd288310f779039b3038de943a3a3148 is retained but is not an approved creative cut or synchronization proof.

No paid generation; $4.72154 remains, no active/unknown render jobs. Local studio restarted with the same existing credentials. Task outputs/shutter/timeline-foundation contains implementation notes, verification, manifest and both previews. Next: efficient preview, clearer take replacement and scene-state scheduling/actual footage review, then targeted paid continuity tests. Pixel source audit is in outputs/shutter/pixel-architecture-review.md.

## Previous checkpoint

# Shutter current checkpoint

## Locked directing decision: shared scene timeline and camera coverage

September 10, 2026. Dom explicitly approved: "lock it in." Canonical decision is scene-time-and-coverage.md. Four nominal15s main-view renders can cover one60s scene; alternate camera coverage replaces intervals on that same timeline without adding runtime. Example coverage14–17s hides the boundary15s; return to main atscene17s, not newrenderframe0. Underlying action and audio keep advancing. Allviews share event/state timing. Useactualdecodedframes/sourcein-out, reversiblecoverage, immutabletakes; noauto-paidgeneration fromediting. Currentendpoint15slimit is provider-specific, not a universalhardcode. Next milestone is this edit/timeline behavior on existingfootage beforemorepaidstudies. Designapproved, notimplemented. Userjudgedearliercoverageeditbetterthoughrapid. No new spending or masterchanges in this lock-in.

## Prior directing reasoning: overlapping scene time

Read scene-time-and-coverage.md before implementation. Dom identified that a middle cutaway must advance scene time or a return from the old frame looks like a reset. Design: generate C from A ending, but cover C's initial interval with B; reveal C after the elapsed cutaway duration. B and C share scene time/action schedule. Example A0-5visible, B5-7visible with C0-2hidden, then C2-5visible atscene7-10. Requires in/out handles and consistent offscreen action, not simple A+B+C concatenation. Alternative: compose C opening for the later state, or explicitly direct a genuine held pose. Three shots are not mandatory for every cut. No code/newgeneration performed for this design; no claim of demonstrated seamlessness. The earlier reused-wide-angle comparison did not prove synchronized generation. Prioritize this authoring/editing milestone before voices. Funds/master unchanged.
## Prior seam investigation

September 10, 2026. Task01a087ae-15fc-7e43-8eb2-126e7883d103. Start here then seam-study-results.md. Prior checkpoint in checkpoint-before-seam-study.md; product state unchanged from placement milestone.

## Latest user correction and evidence

User noticed pause/detail shift where Sol holding shot meets placement. Investigated exact raw sources vs exported master. No inserted timestamp gap: all868 master frames spaced1/24sec. Export appends every sourceframe, no trim/transition. Raw seam already differs: RGBMAE4.60 vs exported4.26. Reencode meanerror2.23; this is not an identity/qualityscore. Original ownershiptail has low motion (.65mean adjacentRGBMAE lastsecond), and following render restarts performance/reframes. Earlier5sectestbriefs were self-contained settledbeats. Seed effect notisolated; don't claim sameseedfix.

Reversible local edit experiment only: originalpair10.3333s, trimonly9.0833s, 6frameblend8.8333s, coveragealternative8.9167s. Blend visibly ghosts face/glasses; rejectaspreferredfix. Coveragealternative inserts0.75s alreadyexistingwidehandoffangle between trimmedcloseup/placement; intentionally changescamera instead ofpretendinginvisiblecontinuation. Frameownershipconsistent, no newgeneration. User reviewed and judged it better though rapid. Audioincludeddecodednotlistenedto. Clips alldecoded24fps. MainselectedcutNOTchanged; no productcodechanges.

Outputs/shutter/seam-study/findings.md, diagnosis.json, edit-receipts.json, boundary/blendframes, original-join.mp4, trim-only.mp4, short-blend.mp4, coverage-edit.mp4. Primarysources linked inreport: MiniMaxH3referencepromptguide explicitlyvideo continuation; falMaxreferenceAPI accepts2-15svideo. Availablemodelroute, not yet proven seamless. Neverconfuse referencevideo with a guaranteedlatentcache or assumechangingseedfixesvelocity.

## Carry forward

Prioritize seamcohesion beforedialogue. Distinguish continuousphysicaltake fromintentionaleditedshot; generateconnectedactiontogetherwherepossible, testactualvideo-tailconditioningforrealcontinuation, planoverlappingcoverageandeditin/outpoints. CurrentContinuefromthistake onlycarriesstill/storynotmotion andmustnotclaimseamless. Ordinaryexports currentlyappendallframes. Product needs actualtrim/coveragecontrols or continuous-generationtest afterthisdiagnosis, notblindcrossfadeorunlimitedretakes.

Funds unchanged4.72154=text.9375+imageReference3.58404+reserve.20. Zero paidcalls thismilestone. CumulativeMax1.47846. Existingproductionprod_ba9072b5-21f0-4973-b413-05678795ef46 rev16 sevenselectedshots36.1667s. App4677 PID16948. Priorfullbackupstudio-placement-checkpoint4productions20jobs41assets, productunchanged. Existingmasteroutputs/shutter/placement-study/the-rain-she-brings-home-v4.mp4 retained. Lastreadyplacementjob_56f64bc0-8895-4494-978a-1e316a5eae15 neverresubmit. Oldpreparedjob_fca8b216-e754-4f82-bf59-48e2429ec307 superseded neverrun. Futurecommercial10unfunded, historicalregularH32.40outsidebaseline. Moment/Lunaricontextintact.
