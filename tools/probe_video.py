"""Independently decode every frame before a local render becomes a ready take."""
import json
import sys
import av

with av.open(sys.argv[1]) as source:
    stream = source.streams.video[0]
    count = 0
    first = last = None
    for frame in source.decode(stream):
        count += 1
        first = frame.time if first is None else first
        last = frame.time
    fps = float(stream.average_rate)
    print(json.dumps({"width": stream.width, "height": stream.height,
                      "frames": count, "fps": fps,
                      "duration": count / fps, "firstTime": first,
                      "lastTime": last, "decoded": count > 0}))
