import sys,json
from pathlib import Path
from fractions import Fraction
import av,numpy as np
from PIL import Image
if sys.argv[1]=='inspect':
    with av.open(sys.argv[2]) as src:
        pictures=list(src.decode(video=0))
    with av.open(sys.argv[2]) as src:
        frames=list(src.decode(audio=0));samples=np.concatenate([f.to_ndarray() for f in frames],axis=1)
        rate=frames[0].sample_rate
    picture=pictures[36].to_ndarray(format='rgb24')
    print(json.dumps({'duration':pictures[-1].time+1/24,'rms':[float(np.sqrt(np.mean(samples[:,int((i+.2)*rate):int((i+.8)*rate)]**2))) for i in range(3)],'middleEdge':float(picture[:,0].mean()),'middleCenter':float(picture[:,32].mean())}))
else:
    root=Path(sys.argv[1]);Image.new('RGB',(64,48),'red').save(root/'still.png')
    for name,width,tone in [('first',64,440),('silent',48,None),('last',64,880)]:
        with av.open(str(root/(name+'.mp4')),'w') as out:
            video=out.add_stream('libx264',rate=24);video.width=width;video.height=48;video.pix_fmt='yuv420p'
            if tone: audio=out.add_stream('aac',rate=48000);audio.layout='stereo'
            for i in range(24):
                frame=av.VideoFrame.from_ndarray(np.full((48,width,3),140,dtype=np.uint8),format='rgb24');frame.pts=i;frame.time_base=Fraction(1,24)
                for p in video.encode(frame):out.mux(p)
            for p in video.encode():out.mux(p)
            if tone:
                wave=(.4*np.sin(2*np.pi*tone*np.arange(48000)/48000)).astype(np.float32)
                frame=av.AudioFrame.from_ndarray(np.stack([wave,wave]),format='fltp',layout='stereo');frame.sample_rate=48000;frame.pts=0;frame.time_base=Fraction(1,48000)
                for p in audio.encode(frame):out.mux(p)
                for p in audio.encode():out.mux(p)
