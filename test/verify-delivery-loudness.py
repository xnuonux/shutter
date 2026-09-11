"""Independent integrated-loudness comparisons, NOT meter conformance certification.
Optional TEST-ONLY dependencies: NumPy, SciPy, pyloudnorm. No app dependency.
Own synthetic signals, quantized before both measurements. No copied source/media.
"""
from pathlib import Path
import hashlib, importlib.metadata, json, subprocess, tempfile, wave, warnings
import numpy as np
import pyloudnorm as pyln

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification'
OUT.mkdir(exist_ok=True)
CASES = []
for rate, channels in [(48000, 1), (48000, 2), (44100, 1), (44100, 2)]:
    t = np.arange(rate * 5) / rate
    mono = .1 * np.sin(2 * np.pi * 997 * t)
    data = mono if channels == 1 else np.column_stack((mono, .07 * np.sin(2 * np.pi * 1511 * t)))
    CASES.append((f'tone-{rate}-{channels}ch', rate, data))
rng = np.random.default_rng(600311)
data = rng.standard_normal((48000 * 8, 2)) * .025
CASES.append(('seeded-stereo-noise', 48000, data))
t = np.arange(48000 * 10) / 48000
gate = np.where((t >= 2) & (t < 6), .1, np.where(t < 2, 0, .0001))
CASES.append(('silence-and-relative-gating', 48000, np.column_stack((gate * np.sin(2*np.pi*997*t), gate * np.sin(2*np.pi*613*t)))))
report = {'scope': 'Independent synthetic integrated-loudness comparisons only; not true-peak or formal standard certification',
          'reference': 'pyloudnorm default K-weighting / 400 ms blocks / native channel layout',
          'versions': {name: importlib.metadata.version(name) for name in ['numpy','scipy','pyloudnorm']},
          'toleranceLu': .12, 'cases': []}
node = """import {measureDeliveryAudio} from './src/media-inspect.mjs';
console.log(JSON.stringify(await measureDeliveryAudio(process.argv[1],0,Number(process.argv[2]))));"""
with tempfile.TemporaryDirectory(prefix='shutter-independent-loudness-') as tmp:
    for name, rate, data in CASES:
        samples = np.rint(np.clip(data, -.99, .99) * 32768).astype('<i2')
        decoded = samples.astype(np.float64) / 32768
        file = Path(tmp) / (name+'.wav')
        with wave.open(str(file), 'wb') as handle:
            handle.setnchannels(1 if data.ndim == 1 else data.shape[1])
            handle.setsampwidth(2); handle.setframerate(rate); handle.writeframes(samples.tobytes())
        before = hashlib.sha256(file.read_bytes()).hexdigest()
        measured = json.loads(subprocess.run(['node','--input-type=module','-e',node,str(file),str(len(data)/rate)],
            cwd=ROOT, text=True, capture_output=True, check=True, timeout=30).stdout)
        with warnings.catch_warnings():
            warnings.simplefilter('error')
            independent = float(pyln.Meter(rate).integrated_loudness(decoded))
        difference = abs(measured['integratedLufs'] - independent)
        unchanged = hashlib.sha256(file.read_bytes()).hexdigest() == before
        result = dict(name=name, sampleRate=rate, channels=1 if data.ndim==1 else data.shape[1],
                      samples=len(data), fixtureSha256=before, ffmpegLufs=measured['integratedLufs'],
                      pyloudnormLufs=independent, differenceLu=difference, originalUnchanged=unchanged,
                      passed=bool(difference <= report['toleranceLu'] and unchanged))
        report['cases'].append(result)
report['passed'] = sum(case['passed'] for case in report['cases'])
report['maxDifferenceLu'] = max(case['differenceLu'] for case in report['cases'])
(OUT/'independent-loudness.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
assert report['passed'] == len(CASES), 'Independent loudness comparison failed'
