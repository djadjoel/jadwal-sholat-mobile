// Membuat gambar sumber untuk `npm run assets` (@capacitor/assets) dari desain ikon versi web.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('assets', { recursive: true });
const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d2660"/><stop offset="1" stop-color="#0b1026"/></linearGradient>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe29a"/><stop offset="1" stop-color="#e08f4f"/></linearGradient>
</defs>`;
const moon = `<path fill="url(#g)" d="M356 318a124 124 0 1 1-162-162 102 102 0 0 0 162 162z"/>
  <path fill="#ffe29a" d="M346 132l11 26 26 11-26 11-11 26-11-26-26-11 26-11z"/>`;
const svg = (body, size = 512, extra = '') =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="1024" height="1024">${defs}${extra}${body}</svg>`);

// Ikon penuh (iOS & legacy Android): latar persegi penuh (sistem yang membulatkan sudut).
await sharp(svg(moon, 512, '<rect width="512" height="512" fill="url(#bg)"/>')).png().toFile('assets/icon-only.png');
// Adaptive icon Android: foreground diperkecil ke zona aman 66%.
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1024" height="1024">${defs}<g transform="translate(256 256) scale(.62) translate(-256 -256)">${moon}</g></svg>`)).png().toFile('assets/icon-foreground.png');
await sharp(svg('', 512, '<rect width="512" height="512" fill="url(#bg)"/>')).png().toFile('assets/icon-background.png');

// Splash 2732×2732: ikon di tengah di atas langit malam.
const splash = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="2732" height="2732">${defs}
  <radialGradient id="sky" cx=".7" cy="0" r="1"><stop offset="0" stop-color="#26306b"/><stop offset=".6" stop-color="#0b1026"/></radialGradient>
  <rect width="2732" height="2732" fill="#0b1026"/><rect width="2732" height="2732" fill="url(#sky)"/>
  <g transform="translate(1366 1366) scale(1.3) translate(-256 -256)">${moon}</g></svg>`);
await sharp(splash).png().toFile('assets/splash.png');
await sharp(splash).png().toFile('assets/splash-dark.png');
console.log('assets/ siap');
