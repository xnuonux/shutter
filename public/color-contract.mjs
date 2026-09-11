/** Bounded SDR color-preparation contracts. No profile or LUT is inferred from a filename. */
export const COLOR_VERSION = 'shutter-color-prep-v1';
export const MAX_CUBE_BYTES = 16 * 1024 * 1024;
const number = text => /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(text) ? Number(text) : NaN;
const plain = value => value && !Array.isArray(value) && typeof value === 'object';

/** Strict 3D-only .cube subset. Red varies fastest. Never accepts a file include or script.
 * Unit-domain, unit-output tables only; shapers and extended-range LUTs fail explicitly. */
export function parseCube(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_CUBE_BYTES) throw Error('color_lut_size');
  text = text.replace(/^\uFEFF/, '');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw Error('color_lut_text');
  let size = null, title = '', started = false;
  const seen = new Set(), rows = [];
  for (const input of text.split(/\r?\n/)) {
    if (input.length > 4096) throw Error('color_lut_line');
    let line = input.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^TITLE\s/.test(line)) {
      if (started || seen.has('TITLE') || !/^TITLE\s+"[^"\r\n]{0,200}"\s*(?:#.*)?$/.test(line)) throw Error('color_lut_title');
      title = line.match(/^TITLE\s+"([^"\r\n]*)"/)[1]; seen.add('TITLE'); continue;
    }
    line = line.split('#', 1)[0].trim();
    const fields = line.split(/\s+/), key = fields[0];
    if (key === 'LUT_3D_SIZE') {
      if (started || seen.has(key) || fields.length !== 2 || !/^\d+$/.test(fields[1])) throw Error('color_lut_grid');
      size = Number(fields[1]);
      if (size < 2 || size > 65) throw Error('color_lut_grid');
      seen.add(key); continue;
    }
    if (key === 'DOMAIN_MIN' || key === 'DOMAIN_MAX') {
      const expected = key === 'DOMAIN_MIN' ? 0 : 1;
      if (started || seen.has(key) || fields.length !== 4 || !fields.slice(1).every(v => number(v) === expected)) throw Error('color_lut_domain');
      seen.add(key); continue;
    }
    if (fields.length !== 3 || fields.some(v => !Number.isFinite(number(v)))) throw Error('color_lut_syntax');
    if (size === null) throw Error('color_lut_grid');
    const values = fields.map(number);
    if (values.some(v => v < 0 || v > 1)) throw Error('color_lut_output_range');
    rows.push(values); started = true;
    if (rows.length > size ** 3) throw Error('color_lut_row_count');
  }
  if (size === null || rows.length !== size ** 3) throw Error('color_lut_row_count');
  const canonical = `LUT_3D_SIZE ${size}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n` + rows.map(row => row.join(' ')).join('\n') + '\n';
  return {size, title, canonical, rows};
}

export function colorSettings(input) {
  if (!plain(input) || Object.keys(input).some(k => !['inputEncoding', 'inputRange', 'lutId', 'reviewed', 'description'].includes(k))) throw Error('color_settings');
  if (!['rec709', 'custom-log'].includes(input.inputEncoding)) throw Error('color_input_encoding');
  if (!['limited', 'full'].includes(input.inputRange)) throw Error('color_input_range');
  if (input.reviewed !== true) throw Error('color_review_required');
  const lutId = input.lutId ?? null;
  if (lutId !== null && (typeof lutId !== 'string' || !/^lut_[a-f0-9]{64}$/.test(lutId))) throw Error('color_lut_identity');
  if (input.inputEncoding === 'custom-log' && !lutId) throw Error('color_conversion_lut_required');
  const description = input.description ?? '';
  if (typeof description !== 'string' || description.length > 200 || /[\u0000-\u001f]/.test(description)) throw Error('color_description');
  if (input.inputEncoding === 'custom-log' && !description.trim()) throw Error('color_log_description_required');
  return {inputEncoding: input.inputEncoding, inputRange: input.inputRange, lutId, reviewed: true, description: description.trim()};
}

/** These tags describe the prepared pixels, not a general automatic camera-profile detector. */
export const isPrepared709 = p => p?.colorPreparation?.schema === COLOR_VERSION &&
  p?.color?.primaries === 'bt709' && p.color.transfer === 'bt709' && p.color.space === 'bt709' && (p.color.range === 'tv' || (p.color.range == null && p.colorPreparation.range === 'limited'));
export const COLOR_TAG_ARGS = ['-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv'];
export const PREPARED_YUV_SCALE = ':in_color_matrix=bt709:out_color_matrix=bt709:in_range=tv:out_range=tv';
// Display-referred Rec.709 / ideal-black BT.1886 (2.4) to sRGB, not inverse camera OETF.
// Reference PNGs have sRGB transfer; a video-frame screenshot is not just a YUV->RGB matrix.
export const PREPARED_REFERENCE_FILTER = 'zscale=matrixin=709:transferin=709:primariesin=709:rangein=limited:matrix=gbr:transfer=iec61966-2-1:primaries=709:range=full,format=gbrpf32le,format=rgb24';
export const SRGB_TAG_ARGS = ['-color_primaries','bt709','-color_trc','iec61966-2-1','-colorspace','rgb','-color_range','pc'];
