// Mengubah ukuran assets/splash.png ke semua berkas splash native (menimpa ukuran yang sama).
import sharp from 'sharp';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const targets = [];
const res = 'android/app/src/main/res';
for (const dir of readdirSync(res)) {
  const f = join(res, dir, 'splash.png');
  if (dir.startsWith('drawable') && existsSync(f)) targets.push(f);
}
const ios = 'ios/App/App/Assets.xcassets/Splash.imageset';
if (existsSync(ios)) for (const f of readdirSync(ios)) if (f.endsWith('.png')) targets.push(join(ios, f));

for (const f of targets) {
  const { width, height } = await sharp(f).metadata();
  const buf = await sharp('assets/splash.png').resize(width, height, { fit: 'cover' }).png().toBuffer();
  await sharp(buf).toFile(f);
  console.log(`${f} ${width}×${height}`);
}
