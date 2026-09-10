"""Fit selected takes without cropping and join sound on the picture timeline."""
import json,sys
from fractions import Fraction
from pathlib import Path
import av
import numpy as np

spec = json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
with av.open(spec['output'], mode='w', options={'movflags':'+faststart'}) as output:
    video = output.add_stream('libx264', rate=spec['fps'])
    video.width, video.height = spec['width'], spec['height']
    video.pix_fmt = 'yuv420p'
    video.options = {'crf':'18','preset':'fast'}
    audio=None
    if spec.get('audioStreams',0):
        audio=output.add_stream('aac',rate=48000);audio.layout='stereo';audio.bit_rate=192000
    count = 0
    sample_count=0
    for filename in spec['inputs']:
        with av.open(filename) as source:
            stream = source.streams.video[0]
            if abs(float(stream.average_rate)-spec['fps'])>.001:
                raise RuntimeError('Frame rates differ; conform them before this export.')
            for frame in source.decode(stream):
                scale=min(video.width/frame.width,video.height/frame.height)
                w,h=max(2,round(frame.width*scale)),max(2,round(frame.height*scale))
                fitted=frame.reformat(width=w,height=h,format='rgb24').to_ndarray()
                canvas=np.zeros((video.height,video.width,3),dtype=np.uint8)
                x,y=(video.width-w)//2,(video.height-h)//2;canvas[y:y+h,x:x+w]=fitted
                frame=av.VideoFrame.from_ndarray(canvas,format='rgb24')
                frame.pts = count
                frame.time_base = Fraction(1, spec['fps'])
                for packet in video.encode(frame):
                    output.mux(packet)
                count += 1
        if audio:
            # Conform each soundtrack to its picture duration so codec padding
            # or a silent shot cannot shift the following scene's sound.
            length=round(count*48000/spec['fps'])-sample_count
            samples=np.zeros((2,length),dtype=np.float32)
            with av.open(filename) as source:
                if len(source.streams.audio)>1:raise RuntimeError('Multiple audio tracks need an explicit mix selection.')
                if source.streams.audio:
                    resampler=av.AudioResampler(format='fltp',layout='stereo',rate=48000)
                    chunks=[]
                    for frame in source.decode(audio=0):
                        for converted in resampler.resample(frame):chunks.append(converted.to_ndarray())
                    for converted in resampler.resample(None):chunks.append(converted.to_ndarray())
                    if chunks:
                        decoded=np.concatenate(chunks,axis=1);n=min(length,decoded.shape[1]);samples[:,:n]=decoded[:,:n]
            for offset in range(0,length,1024):
                frame=av.AudioFrame.from_ndarray(np.ascontiguousarray(samples[:,offset:offset+1024]),format='fltp',layout='stereo')
                frame.sample_rate=48000;frame.pts=sample_count+offset;frame.time_base=Fraction(1,48000)
                for packet in audio.encode(frame):output.mux(packet)
            sample_count+=length
    for packet in video.encode():
        output.mux(packet)
    if audio:
        for packet in audio.encode():output.mux(packet)
if count != spec['frames']:
    raise RuntimeError('The selected cut frame count changed.')
print(json.dumps({'frames':count,'fps':spec['fps'],'seconds':count/spec['fps']}))
