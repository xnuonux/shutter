"""Decode real first and last picture frames for a cut-boundary comparison."""
import sys,json
from pathlib import Path
import av
folder=Path(sys.argv[2]);count=0;last=None
with av.open(sys.argv[1]) as source:
    for frame in source.decode(video=0):
        if count==0:frame.to_image().save(folder/'first.png')
        last=frame;count+=1
if last is None:raise RuntimeError('No decoded picture frames')
last.to_image().save(folder/'last.png')
print(json.dumps({'frameCount':count}))
