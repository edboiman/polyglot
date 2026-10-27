// Writes dist/sw.js with a precache list of every built file and a content
// version. Called by the Vite plugin in vite.config.ts after each build.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function writeServiceWorker(outDir) {
  const files = walk(outDir)
    .map((p) => relative(outDir, p).split(sep).join('/'))
    .filter((p) => p !== 'sw.js' && p !== '404.html' && !p.endsWith('.map'))
    .sort();
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
  const version = hash.digest('hex').slice(0, 12);
  const template = readFileSync(join(here, 'sw-template.js'), 'utf8');
  const header = `const PRECACHE = ${JSON.stringify(['./', ...files])};\nconst VERSION = '${version}';\n`;
  writeFileSync(join(outDir, 'sw.js'), header + template);
  return { files: files.length, version };
}

if (process.argv[2]) console.log(writeServiceWorker(process.argv[2]));
