import sys,json
from pathlib import Path
from fractions import Fraction
import av,numpy as np
from PIL import Image
if sys.argv[1]=='inspect':
    with av.open(sys.argv[2]) as source: frames=list(source.decode(video=0))
    with av.open(sys.argv[2]) as source:
        audio=list(source.decode(audio=0)); samples=np.concatenate([f.to_ndarray() for f in audio],axis=1)
    print(json.dumps({'frames':len(frames),'pixels':[frames[i].to_ndarray(format='rgb24')[24,32].tolist() for i in [17,18,29,30]],
      'rms':[float(np.sqrt(np.mean(samples[:,int(a*48000):int(b*48000)]**2))) for a,b in [(.8,.95),(1.05,1.2),(2.2,2.5)]]}))
else:
    root=Path(sys.argv[1]);Image.new('RGB',(64,48),'red').save(root/'still.png')
    for channel in range(3):
        with av.open(str(root/f'{channel}.mp4'),'w') as out:
            video=out.add_stream('libx264',rate=24);video.width=64;video.height=48;video.pix_fmt='yuv420p';video.options={'crf':'10'}
            if channel!=1: audio=out.add_stream('aac',rate=48000);audio.layout='stereo'
            for i in range(24):
                pixels=np.zeros((48,64,3),dtype=np.uint8);pixels[:,:,channel]=60+i*3
                frame=av.VideoFrame.from_ndarray(pixels,format='rgb24');frame.pts=i;frame.time_base=Fraction(1,24)
                for packet in video.encode(frame):out.mux(packet)
            for packet in video.encode():out.mux(packet)
            if channel!=1:
                wave=(.4*np.sin(2*np.pi*(440+channel*220)*np.arange(48000)/48000)).astype(np.float32)
                frame=av.AudioFrame.from_ndarray(np.stack([wave,wave]),format='fltp',layout='stereo');frame.sample_rate=48000;frame.pts=0;frame.time_base=Fraction(1,48000)
                for packet in audio.encode(frame):out.mux(packet)
                for packet in audio.encode():out.mux(packet)
