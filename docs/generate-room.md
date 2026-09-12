# Generate Room — artist-facing Generative Inserts

Date: 2026-09-12. UI increment on draft PR #9.

`/media-studio` now exposes the governed Generative Insert lifecycle directly beneath Production Memory. The surface is intentionally outcome-first: the artist chooses what the edit needs, not a provider endpoint.

## Intents

- **Alternate** — another candidate for the selected shot; returned output belongs in Take Stack.
- **Continue** — extend outward from the accepted ending frame.
- **New Angle** — adjacent coverage from a different camera position. A derived ending still carries current appearance/state and an audio-free derived tail carries prior motion/time.
- **Bridge** — a creative transition into the next shot. Disabled on the last shot.
- **Arrive** — preceding action that lands on the selected shot's opening frame.

New Angle is disabled for still-photo shots and its unqualified 1080P Ref2V option is disabled in the UI as well as rejected by the backend.

## Artist controls

- **Faithful** (`balanced`) is the default after live H3 testing showed restrained expansion and reliable no-score instruction following.
- **Elaborate** (`quality`) is opt-in; returned model expansion is shown separately from the user's authored direction.
- **Draft / Review / Finish candidate** map to 480P / 768P / 1080P.
- Duration remains bounded to H3's current 5–15 second contract.
- Every plan has its own hard USD ceiling.
- Source-color acknowledgement is required before local composition references are derived.

## Lifecycle in the interface

1. **Save cut & prepare references** saves an unsaved timeline first, then derives references locally. No provider job is created.
2. The plan displays every derived reference and its declared authority before quoting.
3. Disclosure panels list what would leave the device and what remains local.
4. **Get live quote** contacts pricing only; no generation submission occurs.
5. Ref2V quotes visibly separate output cost from variable reference-input reserve.
6. **Authorize & generate** appears only after a quote. The exact reserve and disclosure require a checkbox before submission.
7. Rendering / uncertain jobs expose **Check known provider receipt**. That operation reconciles; it never resubmits.
8. Returned media is reviewed in-place. Provider-added direction and receipt/billing evidence are shown in a separate evidence disclosure.
9. Generated audio is labeled isolated. It never modifies the master or Sound Stage automatically.
10. Alternate offers Take Stack comparison. Continue/New Angle/Bridge/Arrive require a separate “I reviewed this generated shot” acknowledgement before Apply.
11. Apply uses the existing exact-revision timeline operation and reloads the saved cut. Historical results remain inspectable but cannot silently attach to a changed edit.

Recent intent records remain accessible per shot so an interrupted browser session can recover a known quote/receipt/result rather than creating another paid request.

## Draft preservation

The Generate direction itself is treated as an unfinished browser draft until a local Plan record is created. Browser unload warns while that form is dirty. The panel refuses to plan when finishing text is unapplied, and will use the existing Save control before deriving references if the picture cut is unsaved.

This first UI is deliberately not an automatic generation queue. Status reconciliation is explicit because provider submission can become uncertain after crossing the network boundary, and an attractive “retry” button would be a billing hazard.

## Verification scope

`test/browser/generate-dom.py` is an isolated component contract using the actual Generate source with a fake saved timeline and fake provider lifecycle. It checks the default Faithful/Draft policy, New Angle restrictions, local planning/reference disclosure, quote-without-submit, explicit authorization, single submission, returned evidence/audio isolation, Apply review gate and mobile containment.

This component test does not qualify real playback, the full parent browser/server journey, real provider billing or the actual pixels returned by H3. Those remain separate release evidence.
