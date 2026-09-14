/** Saved scene ranges use the production's output frame clock, end exclusive. */
export const SCENE_REVIEW_SCHEMA='shutter-scene-review-v1';
export const SCENE_REVIEW_OPTIONS={
  baseRevision:{type:'integer',minimum:1},
  startFrame:{type:'integer',minimum:0,maximum:1728000},
  endFrame:{type:'integer',minimum:2,maximum:1728000},
  frameCount:{type:'integer',minimum:2,maximum:12}
};
export const SCENE_REVIEW_INPUT={type:'object',additionalProperties:false,required:['baseRevision','startFrame','endFrame'],properties:SCENE_REVIEW_OPTIONS};
