"""Join explicitly selected, equal-format silent takes into a review cut."""
import json
import sys
from fractions import Fraction
from pathlib import Path
import av

spec = json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
with av.open(spec['output'], mode='w', options={'movflags':'+faststart'}) as output:
    video = output.add_stream('libx264', rate=spec['fps'])
    video.width, video.height = spec['width'], spec['height']
    video.pix_fmt = 'yuv420p'
    video.options = {'crf':'18','preset':'fast'}
    count = 0
    for filename in spec['inputs']:
        with av.open(filename) as source:
            if source.streams.audio:
                raise RuntimeError('This first review-cut exporter does not mix audio. Preserve the original soundtrack. Use a qualified audio-capable exporter.')
            stream = source.streams.video[0]
            if stream.width != video.width or stream.height != video.height or float(stream.average_rate) != spec['fps']:
                raise RuntimeError('Selected takes have different formats; choose matching takes before this export.')
            for frame in source.decode(stream):
                frame = frame.reformat(format='yuv420p')
                frame.pts = count
                frame.time_base = Fraction(1, spec['fps'])
                for packet in video.encode(frame):
                    output.mux(packet)
                count += 1
    for packet in video.encode():
        output.mux(packet)
if count != spec['frames']:
    raise RuntimeError('The selected cut frame count changed.')
print(json.dumps({'frames':count,'fps':spec['fps'],'seconds':count/spec['fps']}))
