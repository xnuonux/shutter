# Generative Inserts — governed timeline-to-generation foundation

Date: 2026-09-12. Experimental branch stacked on Production Memory / draft PR #8.

Generative Inserts is the first provider-aware slice of the approved **Production Memory → Generative Inserts → Take Stacks** vision. The timeline supplies context; generation produces candidates; the artist retains control over spending and edit decisions.

See [`h3-live-validation-2026-09-12.md`](h3-live-validation-2026-09-12.md) for the paid H3 Max study that now informs these defaults.

## Artist intents

Shutter models outcomes rather than exposing raw H3 endpoints:

- **Alternate** — another take of the selected shot, bounded by its opening and ending frames. Returned media enters that shot's Take Stack unaccepted.
- **Continue** — continue naturally from the selected shot's accepted ending frame. The result is a reviewed insertion candidate after the shot.
- **New Angle** — create the next adjacent shot from a distinct camera position while carrying current appearance and prior motion. Shutter derives the ending still as **appearance/current-state authority** and a short visual-only tail of the selected shot as **motion/time authority**. The entire camera original and mastered song are not sent.
- **Bridge** — connect the selected shot to the next shot using both boundaries. This is explicitly a creative transition intent; H3 may invent an occlusion, dissolve or transformation when the boundaries differ.
- **Arrive** — create preceding action that resolves into the selected shot's first frame. The returned result is inserted before the destination only after review.

Planning is local. References are derived from the exact saved timeline selection and checked against the saved revision and source checksums before the governed intent record is committed.

## Creative defaults learned from live H3 testing

- **Faithful** = H3 `balanced`; this is the default.
- **Elaborate** = H3 `quality`; it is opt-in because live tests showed quality expansion can add extensive motion, audio direction and non-diegetic music.
- **Draft** = 480P.
- **Review** = 768P.
- **Finish candidate** = 1080P for image-to-video. Reference-to-video 1080P remains deliberately blocked until its reference-input pricing/model behavior is qualified.
- Generated audio policy is `isolated-never-auto-mix`: it never changes the mastered song or Sound Stage automatically.
- The provider's expanded prompt, seed/timings when returned, request ID, estimated/reserved/actual cost and billable units are retained as evidence.

The provider's own `retention_analysis` or statements such as “fully preserved” are **not** accepted continuity truth. They remain unreviewed provider evidence until Shutter/the artist evaluates the returned media.

## Plan → Quote → Submit → Reconcile → Apply

1. **Plan** — local only. Derive the minimum needed references, bind to the exact saved timeline revision and target fingerprint, and record what would leave the device. No provider job.
2. **Quote** — locally decode references, query fal's live endpoint price and return an unauthorized quote. For Ref2V the quote separately reports output cost and a conservative variable reference-input reserve.
3. **Submit** — requires explicit disclosure acceptance, the exact current reserved amount and an artist authorization flag. Pricing, timeline revision and spending ceiling are rechecked immediately before the provider request.
4. **Reconcile** — follow the known provider receipt; never blind-retry an uncertain submission. Download only from allowlisted fal media hosts, decode/verify the result, register immutable output and reconcile actual billable units.
5. **Apply / Accept** — never automatic. Alternate enters the Take Stack. Continue/New Angle/Bridge/Arrive remain insertion candidates until a revision-guarded Apply saves them through normal timeline history.

The mastered soundtrack, markers and finishing text stay on their existing global timeline clock when picture is inserted.

## Cost behavior

Live September 12 testing confirmed the current H3 Max 480P base prices used by Shutter's live quote path: image-to-video/camera-control output at $0.0125/sec and reference-to-video output at $0.05/sec. 768P and 1080P image-to-video observations matched 1.6× and 3.2× multipliers.

Reference-video cost is not just output duration. Two live 5-second prior-video Ref2V samples cost $0.33458 and $0.35506 against a $0.25 base-output price. Shutter therefore exposes variable reference-input reserve and records actual provider billing after completion. The code does not hard-code a promotional calendar price; it asks fal's pricing endpoint at quote and checks it again at submission.

## Data leaving the device

For ordinary I2V intents, only the authored direction and the required derived composition PNG(s) are sent.

For New Angle, the governed disclosure includes:
- one derived PNG containing the accepted current appearance/state;
- one short derived motion-reference video from the selected shot's tail;
- the authored direction.

The New Angle tail is picture-only. Camera originals, mastered song, sound lanes, finishing text and unrelated library media stay local.

## API

```text
POST /api/media/productions/:project/inserts
GET  /api/media/productions/:project/inserts?clipId=:clip
GET  /api/media/productions/:project/inserts/:insert
POST /api/media/productions/:project/inserts/:insert/quote
POST /api/media/productions/:project/inserts/:insert/submit
POST /api/media/productions/:project/inserts/:insert/reconcile
POST /api/media/productions/:project/inserts/:insert/apply
POST /api/media/productions/:project/inserts/:insert/discard
```

The routes remain behind the existing localhost/Origin gate; that gate is not hosted multi-tenant authentication.

## Safety / truthfulness boundaries

- Reference conditioning is not a guarantee of identity or seamless motion.
- Bridge is not advertised as physically seamless.
- Provider-expanded text is retained as provider evidence, not rewritten as user intent.
- Generated audio is never silently mixed under the artist's master.
- Planning does not spend money.
- Quoting does not authorize spending.
- An ambiguous post-send state is `unknown`, not a retry opportunity.
- A result cannot attach to a newer saved target.
- No generated take is accepted automatically.

## Verification

The original Generative Inserts increment had 25 focused tests. This live-evidence refinement adds policy checks for New Angle/Arrive, Faithful defaults, authority-role prompts, reference disclosure and variable Ref2V quote structure. A small local reconstruction used during this pass reported **10/10 new policy/adapter checks passing** and syntax-checked the revised orchestration/provider modules.

That is not a rerun of Production Memory's inherited scoped suite. Actual browser UI for Generate, representative FX30/a6300 media, independent visual qualification of the live H3 outputs, calibrated color and native Resolve/FL Studio interoperability remain open release gates.
