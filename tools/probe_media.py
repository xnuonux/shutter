"""Measure reference inputs and fully decode generated video before acceptance."""
import json, sys
from pathlib import Path
from PIL import Image
import av

filename = sys.argv[1]
if Path(filename).suffix.lower() in ('.png','.jpg','.jpeg'):
    with Image.open(filename) as img:
        img.load()
        print(json.dumps(dict(kind='image',width=img.width,height=img.height,decoded=True)))
else:
    with av.open(filename) as source:
        if source.streams.video:
            stream=source.streams.video[0]
            fps=float(stream.average_rate)
            count=sum(1 for _ in source.decode(stream))
            info=dict(kind='video',width=stream.width,height=stream.height,frames=count,fps=fps,duration=count/fps,decoded=count>0,audioStreams=len(source.streams.audio))
        else:
            stream=source.streams.audio[0]
            duration=sum(frame.samples/frame.sample_rate for frame in source.decode(stream))
            info=dict(kind='audio',duration=duration,decoded=duration>0)
    print(json.dumps(info))
