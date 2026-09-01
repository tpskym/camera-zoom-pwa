import { cp, mkdir } from 'node:fs/promises';

const publicFiles = [
  'index.html',
  'app.js',
  'styles.css',
  'sw.js',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg'
];

await mkdir('dist', { recursive: true });
await Promise.all(publicFiles.map(file => cp(file, `dist/${file}`)));
