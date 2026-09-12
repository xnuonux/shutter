# H3 Max live validation — September 12, 2026

This record preserves the paid provider evidence used to shape Shutter's Generative Inserts contract. The tests used MiniMax H3 Max through fal.ai with a temporary Railway runner. The FAL credential remained a Railway secret reference; it was never copied into source, logs, or conversation output.

## Spend and execution controls

The runner queried fal's live pricing before submission, ran every request sequentially, used per-test ceilings plus a process-wide ceiling, stopped on failure, and never retried an ambiguous submission. No Shutter production media or mastered audio was used. Public fal example media was used so the study could test provider behavior without uploading private camera originals.

Live unit prices observed:
- H3 Max image-to-video 480P: **$0.0125 / output second**
- H3 Max camera-controls 480P base: **$0.0125 / output second**
- H3 Max reference-to-video 480P base: **$0.05 / output second**
- observed resolution multipliers matched Shutter's quote model: 768P 1.6× and 1080P 3.2×

Three rounds completed without retries.

| Round | Actual provider spend |
|---|---:|
| Round 1 — capability spread | $0.50000 |
| Round 2 — resolution/reference depth | $1.00958 |
| Round 3 — intent/authority policy | $0.75214 |
| **Total new spend** | **$2.26172** |

This is tracked study spend, not a statement of the current fal account balance.

## Round 1 — five 5-second 480P probes

1. **Start-frame I2V** — $0.0625. Request `01a09444-485e-7f00-acd6-cfaa26020a56`.
   H3 expanded the opening biker frame into a complete landing/ride event with detailed diegetic sound.

2. **Start + end bridge** — $0.0625. Request `01a09445-2a96-7f80-99ea-cc81f11585cc`.
   The boundary images were intentionally very different. H3 invented a motivated occlusion/transformation between them rather than literal continuous physics. Product implication: Bridge is a creative transition candidate, not a promise of seamless reality.

3. **End-frame-only I2V** — $0.0625.
   H3 invented plausible preceding action that arrived at the supplied target frame. This validated the product concept now named **Arrive** / Dream → Camera.

4. **Camera controls** — $0.0625.
   The provider accepted the camera-trajectory path at the base I2V price. Provider expansion described one continuous camera move.

5. **Single-image Ref2V** — $0.25.
   H3 produced a new-angle plan while retaining the image as subject/world reference. This established the basic reference-to-video path.

## Round 2 — resolution, longer bridges and video reference

1. **1080P I2V, 5 seconds** — $0.20 actual.
   The returned file was much larger and the job took materially longer than the 480P exploration jobs. Product implication: 480P should be the default **Draft** tier; 1080P should be an explicit **Finish candidate**, not the iteration default.

2. **10-second 480P boundary bridge** — $0.125 actual.
   Additional duration gave H3 more room to motivate the transition, but it still invented a transformation between incompatible worlds. Longer duration is creative room, not stronger continuity evidence.

3. **768P camera-controls, 5 seconds** — $0.10 actual.
   This matched the 1.6× resolution multiplier.

4. **Two-image Ref2V, 5 seconds** — $0.25 actual.
   The provider expansion assigned one image to subject/action and the other to environment. No extra charge above the base output cost was observed in this sample.

5. **Prior-video Ref2V, 5 seconds** — **$0.33458 actual vs $0.25 base**.
   H3 treated the video as temporal-continuity evidence, but because the direction only asked for an adjacent shot, its expanded plan inserted an internal camera cut around the middle of the generated clip. The extra $0.08458 demonstrates why video-reference input must be presented as variable-cost material.

Product implication: **Continue** and **New Angle** must be separate artist intents. A generic Ref2V control is not precise enough.

## Round 3 — product-default falsification

### Faithful / balanced expansion

A 5-second I2V request used `prompt_expansion_mode: balanced` and explicitly requested diegetic sound only. Actual cost: $0.0625.

The expanded prompt remained comparatively restrained, kept one continuous landing shot, and returned `non_diegetic_music: N/A`.

Earlier `quality` requests repeatedly invented detailed soundscapes and sometimes non-diegetic scores unless strongly constrained. Therefore Shutter's artist-facing default is:

- **Faithful** → provider `balanced`
- **Elaborate** → provider `quality`, opt-in

The returned expanded prompt is retained as provider evidence so an artist can see what H3 added to the authored direction. H3 does not expose a separate pre-submit expansion endpoint in this path, so Shutter must not pretend the expanded text was reviewed before the paid call.

### New Angle with prior-video continuity

Request `01a09455-d8a2-7f22-bf7c-494bcd8ab312`.
Base estimate $0.25; actual **$0.33458**.

The direction explicitly required:
- begin immediately from a distinct new camera angle;
- one continuous shot;
- no internal cuts;
- preserve ongoing motion/state;
- diegetic audio only.

The provider's expanded plan obeyed those semantics: a single front-tracking angle with prior video used as temporal and diegetic-audio reference. This is why Shutter now models **New Angle** as its own intent rather than an option hidden under Continue.

### Hybrid authority: still + prior video

Request `01a09456-eb0c-7de3-a8ab-03de8eca6762`.
Base estimate $0.25; actual **$0.35506**.

The prompt declared:
- the still image is authoritative for visible appearance / wardrobe / materials / current state;
- the prior video is authoritative only for motion language and temporal continuity;
- appearance wins if the references conflict.

H3's returned plan explicitly reflected that division: appearance was described as preserved from the still while motion/time was described as attribute transfer from the video. This is the reference architecture Shutter should use for Continuity Brain when both current appearance and prior motion context matter.

## Product rules derived from the study

1. **Do not expose model APIs as the primary UX.** Expose artist intents: Alternate, Continue, New Angle, Bridge and Arrive.
2. **Faithful is default.** `balanced` expansion is the default; `quality` is an explicit Elaborate mode.
3. **480P Draft / 768P Review / 1080P Finish.** Higher resolution is not an automatic promotion and should never burn credits just because a take was accepted.
4. **Appearance and motion are different authorities.** For high-control adjacent shots: accepted still → appearance/current state; short prior visual tail → motion/time continuity.
5. **Send derived evidence, not entire sources.** New Angle should send a short, composition-conformed, audio-free motion tail plus the accepted ending still. Camera originals and mastered music remain local.
6. **Generated audio is isolated.** H3 can invent ambience, effects and music. Returned clip audio never replaces or mixes with the mastered song automatically. It may later become a separately reviewed Sound Stage candidate.
7. **Bridge is creative.** H3 may use dust, occlusion, mist, morphing or other transitions to reconcile distant boundary frames. Never label this as guaranteed seamless continuity.
8. **Ref2V cost is variable.** Show output cost separately from reference-input reserve, preserve the provider receipt, then reconcile actual billable units. Video reference produced real overage in both live samples.
9. **Provider self-report is not proof.** H3's returned `retention_analysis`, “fully preserved,” and similar text are useful diagnostic evidence only. They do not become accepted continuity state without independent visual review.
10. **No automatic acceptance or edit mutation.** Generated results remain candidates. Applying or accepting one is a revision-guarded artist action.

## Qualification boundary

This study proves live authentication, endpoint compatibility, receipt handling, live unit pricing, billable-unit reconciliation and the provider's prompt/reference interpretation on these examples.

It does **not** independently prove frame-by-frame identity preservation, seamless boundaries, camera-path accuracy, calibrated color or production suitability of the returned pixels. The live MP4s were real provider outputs, but this ChatGPT execution surface did not perform a frame-by-frame visual qualification of them. Those remain artist/review gates inside Shutter.

The temporary Railway runners were stopped after each round. Their deletion was staged after the study, but Railway requires the account owner's two-factor confirmation to apply destructive service deletion.
