/** Source times are integer microseconds. Inspection never changes a source or cut. */
export const SOURCE_INSPECTION_SCHEMA='shutter-source-inspection-v1';
export const SOURCE_INSPECTION_OPTIONS={
  startUs:{type:'integer',minimum:0,maximum:86400e6},
  endUs:{type:'integer',minimum:1,maximum:86400e6},
  frameCount:{type:'integer',minimum:2,maximum:12}
};
export const SOURCE_INSPECTION_INPUT={type:'object',additionalProperties:false,required:['startUs','endUs'],properties:SOURCE_INSPECTION_OPTIONS};
