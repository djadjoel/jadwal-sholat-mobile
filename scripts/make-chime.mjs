// Membuat nada notifikasi (akor naik E5–A5–B5–E6, sama seperti versi web) sebagai WAV 16-bit mono.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2] || 'android/app/src/main/res/raw/chime.wav';
const rate = 22050, dur = 3.2, n = Math.floor(rate * dur);
const notes = [659.25, 880, 987.77, 1318.5];
const pcm = new Float32Array(n);
notes.forEach((f, i) => {
  const t0 = i * 0.32;
  for (let s = Math.floor(t0 * rate); s < n; s++) {
    const t = s / rate - t0;
    const env = t < 0.03 ? t / 0.03 : Math.exp(-(t - 0.03) * 2.6);
    pcm[s] += 0.22 * env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t));
  }
});
const buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
for (let s = 0; s < n; s++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[s] * 0.9)) * 32767), 44 + s * 2);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);
console.log(`chime → ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
