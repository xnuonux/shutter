# Shutter: current video workflows and a bounded continuity trial

The strongest next step is a short sequence of independently generated scenes built from approved images and explicit story state. H3 Max is the immediate generation engine. Reference-to-video should be used when several sources must control a shot, while video references should earn their extra cost by carrying necessary motion, performance, or camera information.

The research window is August 1 through September 9, 2026. Dated publications below fall within it. Undated endpoint documentation is a September 9 configuration snapshot, not evidence of a release date. Earlier research remains historical background and is not presented as new evidence.

## Current model map

| Capability | Current evidence | Implication for Shutter |
| --- | --- | --- |
| H3 Max text-to-video | Current schema: 5–15 seconds, 480P/768P/1080P, six aspect ratios, native audiovisual output | Establishing shots, visual experiments, short autonomous moments |
| H3 Max image-to-video | Opening image, optional ending image; canvas follows supplied image | Animate an approved composition, test first/last-frame transitions |
| H3 Max reference-to-video | Combined image, video and audio references; different input billing | Bind identity, current appearance, location, props and a necessary motion/voice source |
| H3 Max Multi Angle | Current endpoint exposes camera trajectory keyframes | Candidate for planned camera movement around a still scene; qualify separately |
| Seedance 2.5 | August BytePlus-authored guide covers longer scenes, reference roles and explicit state progression | Learn its production method; do not substitute it into this funded trial |
| Gemini Omni Flash 1.1 | September 6 guide demonstrates successive edits and a separate multimodal reference route | Keep editing and reference generation as distinct product operations |
| Lucy 2.5 | September 2 guide describes live/recorded stream editing | Future interactive editing capability, outside the current H3 budget |
| Higgsfield Genjutsu | August 31 guide separates object swap and motion transfer | Competitor evidence that these deserve their own review criteria |

The live H3 Max schemas supersede stale settings in earlier guides. In particular, 1080P is described as latent refinement from a native 768P source. It should not be sold as independently native 1080P generation. Generated sound is not proof of consistent voice across calls. The current study has not yet qualified Max, and the prior regular-H3 results cannot substitute for that qualification.[1][2][3]

H3 Max Multi Angle is a particularly relevant discovery. It accepts ordered camera poses with time, azimuth, elevation and distance. Its default instruction freezes the scene while the camera moves. This is a plausible low-cost test for camera planning, but an orbit inferred from one image is not a reconstruction of unseen set geometry. Its publication date was not established; its live configuration was checked September 9. No paid test has been run.[4]

## What the fresh walkthroughs contribute

**August 7: BytePlus-authored Seedance 2.5 production guide.** This is the most useful current reference for the overall method. It explicitly maps each asset to its job, builds subject profiles, selects only the materials relevant to each scene, and describes the visible starting and ending state of each stage. It also distinguishes the model's maximum input capacity from recommended smaller reference sets. The transferable lesson is deliberate reference selection, not feeding the entire production library into every request.[5]

**August 20: Emily Peng's storyboard walkthrough.** The demonstrated workflow uses a four-view character sheet, a high-resolution storyboard, then video generation. The author explains that storyboard panels guide narrative beats rather than exact frame reproduction. Specific hero compositions are generated separately, and panel lettering can leak into the output. For Shutter, storyboards should help plan a sequence; a shot that needs precise composition should receive its own approved still.[6]

**September 9: Peng's comparison of Seedance 2.0 and 2.5.** Her same-prompt examples report stronger overall continuity and contact physics in 2.5, but still show wardrobe drift and mismatched movement speed. Her stylized and camera tests favor 2.0 in some cases. This is a useful counterweight to universal “newer is better” claims. It is one creator's demonstration, not a statistically controlled benchmark, and multishot examples must not be mistaken for independent-render episode proof.[7]

**August 12: Higgsfield's Cinema Studio retrospective.** The team describes testing and tuning camera/lens combinations, preserving look metadata with generated frames, and carrying project style across generations. It also describes preserving older versions when creators wanted them. Shutter's implication is a stable production look and versioned presets whose effect is actually tested. Camera-brand names alone do not establish physically accurate optics.[8]

**August 20 and September 5: Blender Bridge and 3D Jutsu.** The Blender guide distinguishes an asset-generation connection from a separate bridge into the open scene. The newer browser workspace exposes editable objects, camera animation and revision history. Its worked example combines a rendered blockout, a character reference and a location reference, assigning motion and framing to the blockout. Shutter already has a useful Blender foundation; the next increment is a deliberate camera/geometry reference, not a second large agent platform.[9][10]

**September 2: Claude creative-studio workflow.** The guide emphasizes establishing reusable references, finding previous assets, and preparing voiceover first for voice-led work. That is useful orchestration: reuse the correct asset, carry its role forward and retain the resulting take. The connection itself does not solve visual continuity.[11]

**August 31 and September 2: Genjutsu and Lucy 2.5.** Both position selective editing as its own workflow. Genjutsu distinguishes object replacement from motion transfer; Lucy's guide advocates short, visible, one-change instructions and sequential adjustments. Their preservation claims are vendor claims, not a pixel-level guarantee verified here. An edited clip needs comparison outside the target region, temporal inspection and audio checks before acceptance.[12][13]

**September 6: Gemini Omni Flash 1.1.** The guide includes a first edit followed by another edit on its output, and separately binds a character, location and short camera/motion reference. That provides a useful future regression test: does a second edit preserve the first accepted change? Its reference syntax and limits differ from H3, reinforcing the need for endpoint-specific translation.[14]

A firsthand Reddit account describing a 12-minute film was also inspected. It suggested simpler reference sheets, composition stills, stable lighting descriptions and short low-resolution trials. Its absolute publication date and finished-film provenance were not established reliably enough to use it as dated proof for this refresh. It remains an unverified lead, not evidence that a 20-minute workflow is solved.

## The production method to build

This is a proposed Shutter design derived from the evidence, not a claim that the current app already implements it.

A production keeps a cast library, place library, props, visual treatment and chosen takes. Each character has an original identity reference and explicit current appearance. A costume change, wet coat, missing accessory or injury creates a new state rather than overwriting the original. A scene references the appropriate state.

Each shot records:

- what is already true at its opening: location, wardrobe condition, possession, positions and time of day;
- one main action, its timing and the intended visible ending;
- camera view and screen direction, with optional geometry or a short motion reference;
- the exact role of each attached asset;
- dialogue and sound requirements;
- its selected endpoint, settings, estimated charge and returned take.

Do not chain every new shot only from the previous generated frame. That can carry an unnoticed error forward. Re-anchor against the original identity and the selected current state, using a recent frame only when it contributes relevant continuity. Conversely, an old clean portrait must not erase an intentional current costume change.

Before a paid render, inspect the still composition. Check relative character height, accessory placement, prop count, hands, eyelines and set layout. If the wrong starting state is visible in the still, fix the still first. During the funded trial, keep the adult stylized original cast Mira and Sol so that spending tests the workflow rather than repeated redesign.

For a new angle, prepare that view of the same set. A wide location image can fight a requested close-up. For a transition to another place, explicitly identify the new place and which facts survive the cut. A Blender camera or diagram can clarify geometry, but the video model still has to demonstrate that it follows it.

Keep audio review separate. A recognizably similar face does not certify the same voice, exact words or believable lip sync. Current local inspection can decode audio and expose it for playback, but this agent cannot listen in this session. Voice acceptance requires actual listening.

For selective editing, retain the source take and create a derived take. Never silently replace the source. The prior regular-H3 sphere edit changed pixels and audio beyond the intended sphere; it is evidence that an edit can retain broad action, not evidence of exact preservation.

Moment remains a fast entry into this same asset/take system. It should allow a short idea to become a shot without requiring a full production form. Longer projects progressively add the information that the work needs.

## Verified price snapshot and spending boundary

The current remaining allocation is **$6.20**, based on Dom's latest account report. Historical regular-H3 spending was $2.40 and must not be deducted again from this new figure. No paid request was submitted during this research refresh.

| Route | 480P per output second | 768P per output second | Additional cost |
| --- | ---: | ---: | --- |
| H3 Max text-to-video | $0.0125 | $0.02 | No reference input |
| H3 Max image-to-video | $0.0125 | $0.02 | Current page lists output-second pricing |
| H3 Max reference-to-video | $0.05 | $0.08 | Pooled reference tokens above the free allowance |

T2V and I2V prices are promotional through September 14. The pages state $0.05/$0.08 afterward. Recheck before submission rather than relying on this document after the offer expires. The reference route currently has different pricing.[1][2][3]

Reference inputs share a 4,096-token allowance, followed by $0.02 per 1,000 tokens. Image tokens are width × height / 1,024. Audio is approximately 80 tokens per second. Reference-video tokens depend on output resolution: approximately 2,886 per second at 480P and 7,459 at 768P. Downscaling the uploaded reference video alone does not reduce that component.[3]

A five-second 480P output with two 1024-square images and a two-second video reference is approximately $0.32448 before billing rounding. Reserve $0.33. The same route with five seconds of 768P output, two such images and five seconds of video reference is approximately $1.105. That is why 100 output seconds for $5 is only a reference-route ceiling at 480P with no overage or retries, not a guaranteed usable runtime.

## Test allocation

The allocations are ceilings, not instructions to spend everything.

| Pool | Allocation | Initial planned use | Unassigned within pool |
| --- | ---: | ---: | ---: |
| H3 Max text-to-video | $1.00 | $0.45 | $0.55 |
| H3 Max image/reference-to-video | $5.00 | At most $3.18 | At least $1.82 |
| General reserve | $0.20 | $0.00 | $0.20 |
| Total | $6.20 | At most $3.63 | At least $2.57 |

The text trial starts with four distinct five-second 480P briefs, totaling $0.25: a stable establishing shot, one clear physical event, a short directed line, and a two-beat mini-scene. Two selected briefs can then be repeated at 768P for $0.20. This tests general usefulness and resolution sensitivity. It does not test cast identity across calls because there is no image input.

The image/reference pool is a maximum sequence, subject to earlier results:

| Test | Quantity and settings | Reserved estimate | Question |
| --- | --- | ---: | --- |
| Four independent story shots from approved stills | 4 × 5s I2V, 480P | $0.25 | Do identity, state and layout survive separate calls? |
| Higher-resolution comparison of those shots | Up to 4 × 5s I2V, 768P | $0.40 | Does 768P resolve relevant defects? |
| Selected multi-image reference shots | Up to 3 × 5s Ref2V, 480P | $0.75 | Does role-bound referencing improve difficult composition? |
| Selected reference confirmation | Up to 2 × 5s Ref2V, 768P | $0.80 | Does the useful reference behavior survive the delivery tier? |
| Motion-reference comparison | Up to 2 × 5s Ref2V, 480P; each 2s input video plus two 1024-square images | $0.66 | Does the extra reference cost buy better motion/camera control? |
| Voice-reference check | 1 × 5s Ref2V, 480P; two 1024-square images plus 5s audio | $0.25 | Does a known voice persist, subject to listening? |
| First/last-frame transition | 1 × 5s I2V, 480P | $0.07 | Can a controlled change connect accepted endpoints? |
| Total | Conditional, not a queued batch | $3.18 | Leaves $1.82 for diagnosed corrections |

The multi-image estimates require total image tokens at or below 4,096. Actual dimensions must be measured. The audio test also shares that allowance. No alternative paid model or Director stream is included. Multi Angle can replace one camera test after its trajectory schema is qualified; it should not silently add another spend.

The four story shots should form one twenty-second scene: reverse coverage in the observatory; a cut to a windswept ridge with an intentional wet/clothing condition; a second view there with stable prop possession; and a return to the observatory retaining the changed condition. This deliberately tests new locations and accumulated state. Approve the stills against that state before rendering.

Run the first inexpensive request and reconcile its actual charge before expanding. Submit sequentially, retain request IDs, and recover uncertain requests instead of resubmitting. If a test fails, classify the failure before trying again. Change one relevant input, not a paragraph of unrelated adjectives. A higher-resolution generation is a new stochastic take, not an upscale or a guaranteed improvement.

Stop expansion when the next call would repeat an unanswered failure without a new hypothesis, exceed its pool, rely on an unpriced input, or produce footage that cannot answer its stated question. An inconclusive result should retain the money needed for a better test.

## What this can and cannot establish

A successful trial can qualify a small real sequence and the product operations needed to repeat it: asset selection, state binding, endpoint translation, cost prediction, take review and assembly. It can expose whether image-to-video is sufficient for common shots and where multimodal references add value.

It cannot establish universal reliability, commercial readiness for every type of video, or a drift-free twenty-minute episode from a handful of takes. Episode production also needs longer-range story checks, editorial decisions, dialogue continuity, sound mixing and reliable recovery. Shutter should expose those operations as the work grows rather than promise that a larger prompt removes them.

The existing Shutter app still prepares Wan jobs. The successful regular-H3 study is external to the app. Adding a small H3 Max adapter and the current-state reference selection is the next implementation milestone; no such integration is claimed in this report.

The six-repository code audit remains saved with pinned source evidence. No fresh August/September repository implementation was verified in this refresh that supersedes it. No third-party code, competitor prompt library or new large agent stack was adopted.

## Sources

1. fal, [H3 Max text-to-video](https://fal.ai/models/minimax/h3-max/text-to-video). Live endpoint and agent-readable schema, checked September 9, 2026.
2. fal, [H3 Max image-to-video](https://fal.ai/models/minimax/h3-max/image-to-video). Live endpoint and agent-readable schema, checked September 9, 2026.
3. fal, [H3 Max reference-to-video](https://fal.ai/models/minimax/h3-max/reference-to-video). Live endpoint and reference-token pricing, checked September 9, 2026.
4. fal, [H3 Max Multi Angle](https://fal.ai/models/minimax/h3-max/multi-angle/image-to-video). Live endpoint and schema, checked September 9, 2026; release date not established.
5. BytePlus, [How To Use Seedance 2.5: Documentation Guide](https://fal.ai/learn/devs/how-to-use-seedance-2-5). August 7, 2026. Reference-role and state-progression sections.
6. Emily Peng, Kapwing, [How to Make a Full AI Video from a Storyboard](https://www.kapwing.com/resources/how-to-make-a-full-ai-video-from-a-storyboard-seedance-2-5/). August 20, 2026.
7. Emily Peng, Kapwing, [Is Seedance 2.5 Actually Better Than 2.0?](https://www.kapwing.com/resources/is-seedance-2-5-actually-better-than-2-0-heres-what-i-found/). September 9, 2026.
8. Higgsfield, [How We Built Cinema Studio](https://higgsfield.ai/blog/how-we-built-cinema-studio). August 12, 2026.
9. Higgsfield, [Blender: Features, Installation, and MCP Bridge Setup](https://higgsfield.ai/blog/higgsfield-blender-plugin). August 20, 2026.
10. Higgsfield, [3D Jutsu: Build and Animate 3D Scenes from a Prompt](https://higgsfield.ai/blog/higgsfield-3d-jutsu). September 5, 2026.
11. Higgsfield, [How to Turn Claude Into a Full Creative Studio](https://higgsfield.ai/blog/claude-higgsfield-mcp-creative-studio). September 2, 2026.
12. Higgsfield, [Genjutsu: How It Works and What You Get](https://higgsfield.ai/blog/higgsfield-genjutsu). August 31, 2026.
13. John Ozuysal, fal, [Real-Time Video Editing with AI](https://fal.ai/learn/tools/real-time-video-editing-with-ai). September 2, 2026.
14. John Ozuysal, fal, [Gemini Omni Flash 1.1: Prompts and Workflows](https://fal.ai/learn/tools/how-to-use-gemini-omni-flash-1-1). September 6, 2026.
15. John Ozuysal, fal, [How To Use MiniMax H3 Max](https://fal.ai/learn/tools/how-to-use-minimax-h3-max). September 1, 2026. Useful workflow and editing distinction; its older resolution/pricing statements are superseded by current endpoint pages.
