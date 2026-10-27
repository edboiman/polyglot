import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { writeServiceWorker } from './scripts/precache.mjs';

/** Generates dist/sw.js with a precache list of every built file. */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'polyglot-service-worker',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const r = writeServiceWorker(outDir);
      console.log(`service worker: precaching ${r.files} files (version ${r.version})`);
    },
  };
}

// `base: './'` makes every asset path relative, so the same build works at
// https://user.github.io/<repo>/ (GitHub Pages project site), at a custom
// domain root, or from any sub-folder. Navigation uses the URL hash, so no
// server-side rewrites are needed.
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
