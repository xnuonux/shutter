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
