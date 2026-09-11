/** Synthetic PCM fixtures written independently of the media pipeline. */
export function pcm24(samples, value, {rate=48000,channels=2}={}) {
  const data=Buffer.alloc(samples*channels*3),head=Buffer.alloc(44);
  for(let i=0;i<samples;i++)for(let c=0;c<channels;c++)data.writeIntLE(value(i,c),(i*channels+c)*3,3);
  head.write('RIFF');head.writeUInt32LE(data.length+36,4);head.write('WAVEfmt ',8);
  head.writeUInt32LE(16,16);head.writeUInt16LE(1,20);head.writeUInt16LE(channels,22);
  head.writeUInt32LE(rate,24);head.writeUInt32LE(rate*channels*3,28);head.writeUInt16LE(channels*3,32);head.writeUInt16LE(24,34);
  head.write('data',36);head.writeUInt32LE(data.length,40);return Buffer.concat([head,data]);
}
export const fixturePng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
