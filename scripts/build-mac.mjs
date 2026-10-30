// Builds the macOS app for one architecture: node scripts/build-mac.mjs <x64|arm64>
//
// Same as running electron-packager from the command line, plus one extra step:
// Electron ships ~55 UI translations (~35 MB) that this English-only app never uses,
// so every *.lproj folder except English is removed from the finished app.
import fs from 'node:fs';
import path from 'node:path';
import { packager } from '@electron/packager';

const KEEP_LOCALES = new Set(['en.lproj', 'Base.lproj']);

const arch = process.argv[2];
if (!['x64', 'arm64'].includes(arch)) {
  console.error('Usage: node scripts/build-mac.mjs <x64|arm64>');
  process.exit(1);
}

function removeUnusedLocales(dir) {
  let removed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.name.endsWith('.lproj')) {
      if (!KEEP_LOCALES.has(entry.name)) {
        fs.rmSync(fullPath, { recursive: true });
        removed++;
      }
    } else {
      removed += removeUnusedLocales(fullPath);
    }
  }
  return removed;
}

const [appDir] = await packager({
  dir: '.',
  name: 'Serato Library Sync',
  platform: 'darwin',
  arch,
  icon: 'assets/icon.icns',
  out: 'dist',
  overwrite: true,
  ignore: [/^\/\.claude/, /^\/dist/, /^\/scripts/],
  afterComplete: [({ buildPath }) => {
    const removed = removeUnusedLocales(buildPath);
    console.log(`Removed ${removed} unused locale folders`);
  }],
});

console.log(`Wrote new app to: ${appDir}`);
