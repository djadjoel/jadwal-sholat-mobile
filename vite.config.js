import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: ['es2020', 'chrome89', 'safari15'],
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: { host: true, port: 5173 },
});
