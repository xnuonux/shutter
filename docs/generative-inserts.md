# Generative Inserts — governed timeline-to-generation foundation

Date: 2026-09-12. Experimental backend increment stacked on Production Memory commit `880268cc4c01f5463d9b950fdd227a15f97adda4` / draft PR #8.

This implements the first provider-aware half of the founder-approved **Production Memory → Generative Inserts → Take Stacks** loop. It is deliberately built around the saved production rather than a disconnected prompt box.

## What is implemented

A saved shot can now be planned as one of three intents:

- **Alternate** — derive the clean first and last visible composition frames of the selected shot. The eventual result belongs under that shot's Take Stack and is never accepted automatically.
- **Continue** — derive the clean final visible frame. The eventual result is an insertion candidate anchored after the selected shot; the current cut is not lengthened automatically.
- **Bridge** — derive the selected shot's final visible frame and the next shot's first visible frame. The eventual result is an insertion candidate between those shots; it does not silently replace either side.

Reference frames are rendered locally from the actual saved timeline selection and its preserved cadence sampling. Fit/Fill is therefore reflected in the reference. Finishing text and audio are excluded. The source asset is checksum-verified before and after extraction. The timeline revision and target selection are checked again after asynchronous decoding and again before the governed plan record is written. A changed cut fails rather than rebinding an old request to a new edit.

A plan stores the exact timeline revision, plan hash, target fingerprint, source checksums, generated reference assets, intended landing behavior, prompt, duration, resolution, prompt-expansion mode, and a hard per-insert spending ceiling. Planning itself does **not** contact a provider or create a provider job.

## Provider and spending flow

The API separates four materially different acts:

1. **Plan** — local only. Creates reviewed PNG boundary references and a persistent intent record. No provider job, upload, quote or generation.
2. **Quote** — creates a timeline-bound H3 image-to-video job and asks fal's live pricing endpoint for the current endpoint price. It locally probes references but does not submit generation media. The quote is recorded with an expiry and remains unauthorized.
3. **Submit** — requires the exact insert-record revision, explicit disclosure acceptance, `authorize: true`, and the exact quoted reserved amount. The per-insert ceiling and the existing global Shutter study budget are both enforced. Provider pricing is checked again immediately before submission.
4. **Reconcile** — follows a known provider receipt, downloads the returned video only from the existing allowlisted fal hosts, verifies its decoded profile, registers it as immutable media, and then connects it back to the production.

If submission fails after Shutter has crossed the provider boundary and cannot know whether the request was accepted, the job becomes **unknown**. It is not automatically submitted again. If there is a provider receipt, explicit reconciliation can continue from it.

An H3 image-to-video output for an **Alternate** is added to the existing Take Stack as `generated-candidate` only when the saved target is still exactly current. It remains unaccepted and the authored timeline is unchanged. The existing Take Stack fit check still decides whether the generated duration can fill that shot without stretching. Continue/Bridge results become `ready-insert` candidates; they do not lengthen the cut automatically. A separate revision-guarded **Apply** action inserts the decoded generated result immediately after the target shot, preserves the mastered song, markers and finishing text on their existing timeline clock, and saves the change through normal timeline history. A stale target becomes `ready-historical` rather than being attached to a newer edit.

## Data leaving the device

The plan records a disclosure before any paid action. For the current image-to-video path, submission sends:

- the authored prompt;
- one derived PNG for Continue;
- two derived PNGs for Alternate or Bridge.

Camera originals, the mastered song, independent sound lanes, finishing text and unrelated library media remain local. The current fal adapter sends those PNGs as base64 data URIs from the server side, so the API key is not exposed to browser code.

The derived PNGs are composition references, not calibrated color proofs. The source production is still an unmanaged-SDR rough-cut pipeline. Explicit color-review acknowledgement remains required before a plan is created.

## H3 adapter update

The existing H3 adapter was refreshed to match the current fal H3 Max image-to-video contract used by this feature:

- 480P / 768P / 1080P selection;
- `balanced` or `quality` prompt expansion;
- optional opening `image_url` and ending `end_image_url`;
- 5–15 second duration;
- live fal endpoint pricing at quote time instead of a calendar-coded launch-promotion price;
- resolution multipliers carried through the quote (480P 1×, 768P 1.6×, 1080P 3.2×);
- timeline-revision validation for media-studio jobs;
- a per-job spending ceiling checked before provider submission.

The Reference-to-Video endpoint also advertises 1080P, but Shutter still blocks **1080P reference-to-video** because the existing reference-video token estimator is only modeled for the published 480P and 768P token coefficients. That conservative block does not affect this Generative Insert image-to-video path.

Primary provider references checked September 12, 2026:

- https://fal.ai/models/minimax/h3-max/image-to-video/api
- https://fal.ai/minimax-h3-max
- https://fal.ai/models/minimax/h3-max/reference-to-video

The current public H3 Max launch rate is promotional through September 14, 2026. This code intentionally does not hard-code the calendar promotion into the quote path; it reads the endpoint's live unit price. No paid live render was executed during this development pass.

## HTTP contract

All routes still sit behind the existing local Host/Origin/Sec-Fetch-Site gate. That gate is not hosted multi-tenant authentication.

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

Planning request example:

```json
{
  "requestKey": "client-generated-idempotency-key",
  "baseRevision": 12,
  "clipId": "shot_12",
  "kind": "bridge",
  "prompt": "Continue the camera push as the room dissolves into black liquid glass, then settle naturally into the next real shot.",
  "duration": 5,
  "resolution": "768P",
  "quality": "balanced",
  "maxUsd": 0.50,
  "acknowledgeUnmanagedColor": true
}
```

Submission is a separate request and requires the exact quote amount:

```json
{
  "baseRevision": 4,
  "authorize": true,
  "acceptDisclosure": true,
  "acceptedReservedUsd": 0.10
}
```

The exact amount above is only an example. The caller must use the current returned quote.

## Verification performed in the scoped implementation workspace

**25 focused tests passed** in this development pass:

- 11 pure Generative Insert contract tests;
- 5 H3/fal adapter tests with a fake pricing/provider boundary;
- 9 orchestration tests using the exact `generative-inserts.mjs` under a dependency loader.

The orchestration checks cover local-only planning, idempotent request keys, cut mutation during frame extraction, quote-without-authorization, discard-after-quote without provider submission, explicit submission authorization, ambiguous submission state, generated Alternate → unaccepted Take Stack candidate, Continue → separate insert candidate with an unchanged timeline, and explicit Continue application → one saved picture insertion while soundtrack/markers/text remain unchanged.

The provider tests verify that 1080P/quality reach H3 image-to-video input, quote preparation uses a live pricing response rather than a date constant, timeline jobs reject a newer saved cut, and the per-insert spending ceiling is checked before submission. They do not constitute a live provider render or billing certification.

These 25 tests are **not** the preceding PR #8's 392-test scoped suite. The full inherited suite has not been rerun in this incremental workspace. Actual FFmpeg integration of `generative-inserts.mjs`, actual parent HTTP routing, browser UI, FAL_KEY behavior, provider receipt/download behavior, real camera media, color appearance and native editor interoperability remain unqualified in this pass. The new feature is therefore a draft engineering branch, not a release claim.

## Important remaining work

The immediate next user-facing step is the contextual **Generate** surface inside Production Memory / Take Stack:

- choose Alternate / Continue / Bridge from the currently selected shot;
- show the derived opening/ending references before quoting;
- show exactly what will leave the device;
- obtain the live quote without submitting;
- require explicit spend authorization;
- show unknown/reconcile states without a retry button that can duplicate charges;
- refresh the Take Stack automatically when a generated Alternate arrives;
- expose the existing deliberate Apply operation for Continue/Bridge only after the user reviews the returned media; never auto-change duration.

After that, model routing can sit above this contract instead of leaking provider APIs into the artist's workflow. The artist should ask for an outcome; Shutter should retain the evidence, cost, provider receipt and reversible production decision underneath it.
