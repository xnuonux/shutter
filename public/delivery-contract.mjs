/** Shared, dependency-free contract for read-only delivery inspection. */
export const DELIVERY_SCHEMA = 'shutter-delivery-check-v1';
export const DELIVERY_DEFAULTS = Object.freeze({
  targetLufs: null, toleranceLu: 1, truePeakCeilingDbtp: null, scanPicture: true,
});
export function deliveryOptions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !Object.hasOwn(DELIVERY_DEFAULTS, key))) {
    throw Error('delivery_options');
  }
  const value = {...DELIVERY_DEFAULTS, ...input};
  const within = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  if (value.targetLufs !== null && !within(value.targetLufs, -60, -5)) throw Error('delivery_target');
  if (!within(value.toleranceLu, 0.1, 6)) throw Error('delivery_tolerance');
  if (value.truePeakCeilingDbtp !== null && !within(value.truePeakCeilingDbtp, -12, 0)) throw Error('delivery_peak_ceiling');
  if (typeof value.scanPicture !== 'boolean') throw Error('delivery_picture_option');
  return value;
}
/** Historical evidence never becomes a current-draft endorsement. */
export function deliveryScope(report, cut, currentRevision, dirty = false) {
  if (!report || !cut || report.cutId !== cut.id || report.outputAssetId !== cut.output ||
      report.revision !== cut.revision) return 'wrong-cut';
  if (dirty || currentRevision !== cut.revision) return 'older-saved-render';
  return 'saved-render';
}
export function loudnessFindings(audio, options, subject) {
  const findings = [];
  if (audio?.status !== 'measured') return findings;
  if (audio.integratedLufs === null) findings.push({code:'loudness-unassessed', subject, severity:'notice',
    message:'Integrated loudness is unavailable: silence, below-gate material or an insufficient analysis window.'});
  if (audio.truePeakDbtp !== null && audio.truePeakDbtp >= 0) findings.push({code:'true-peak-full-scale',subject,severity:'review',
    message:'Estimated reconstructed peaks reach or exceed full scale. Listen and review; no limiting was applied.'});
  if (options.targetLufs !== null && audio.integratedLufs !== null &&
      Math.abs(audio.integratedLufs - options.targetLufs) > options.toleranceLu) {
    findings.push({code:'loudness-outside-target',subject,severity:'review',
      message:'Integrated loudness lies outside your selected review range. The master was not normalized.',
      measuredLufs:audio.integratedLufs,targetLufs:options.targetLufs,toleranceLu:options.toleranceLu});
  }
  if (options.truePeakCeilingDbtp !== null && audio.truePeakDbtp !== null &&
      audio.truePeakDbtp > options.truePeakCeilingDbtp) {
    findings.push({code:'true-peak-above-ceiling',subject,severity:'review',
      message:'Estimated true peak is above your selected review ceiling. No automatic gain change was made.',
      measuredDbtp:audio.truePeakDbtp,ceilingDbtp:options.truePeakCeilingDbtp});
  }
  return findings;
}
export function deliveryStatus(checks, findings) {
  if (checks.some(c => c.status === 'fail')) return 'technical-issues';
  if (checks.some(c => c.status === 'unassessed')) return 'incomplete';
  if (findings.some(f => f.severity === 'review')) return 'review-needed';
  return 'checks-complete';
}
