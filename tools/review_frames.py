"""Extract unaltered start/middle/end frames for human continuity review."""
import argparse
from pathlib import Path
import av

parser = argparse.ArgumentParser()
parser.add_argument('video')
parser.add_argument('output')
args = parser.parse_args()
destination = Path(args.output)
destination.mkdir(parents=True, exist_ok=True)
with av.open(args.video) as source:
    stream = source.streams.video[0]
    targets = {0:'start', stream.frames//2:'middle', stream.frames-1:'end'}
    for index, frame in enumerate(source.decode(stream)):
        if index in targets:
            target = destination/(targets[index]+'.png')
            frame.to_image().save(target)
            print(str(target.resolve()))
