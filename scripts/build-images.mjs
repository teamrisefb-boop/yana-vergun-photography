import sharp from 'sharp';
import { parse } from 'parse5';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const doc = parse(await readFile(new URL('index.html', root), 'utf8'));
const paths = new Set();
function visit(node) {
  const attrs = Object.fromEntries((node.attrs || []).map(a => [a.name, a.value]));
  if (node.tagName === 'img' && attrs.class?.includes('ph__img')) paths.add(attrs['data-original'] || attrs.src);
  for (const child of node.childNodes || []) visit(child);
}
visit(doc);
await mkdir(new URL('assets/optimized/', root), { recursive: true });
const manifest = {};
const force = process.argv.includes('--force');
sharp.concurrency(2);
for (const path of paths) {
  const input = fileURLToPath(new URL(path, root));
  const metadata = await sharp(input).metadata();
  const { width, height } = metadata.autoOrient;
  const stem = basename(path, extname(path));
  const widths = [...new Set([240, 480, 800, 1200, 1600, Math.min(width, 2400)].filter(w => w <= width))].sort((a,b) => a-b);
  const originalStat = await stat(input);
  const entry = { original: path, width, height, originalBytes: originalStat.size, variants: [] };
  for (const w of widths) {
    const variant = { width: w, height: Math.round(height * w / width) };
    for (const format of ['avif', 'webp', 'jpg']) {
      const output = `assets/optimized/${stem}-${w}.${format}`;
      const image = sharp(input).autoOrient().resize({ width: w, withoutEnlargement: true }).toColourspace('srgb');
      if (format === 'avif') image.avif({ quality: 60, effort: 4 });
      if (format === 'webp') image.webp({ quality: 84, effort: 4 });
      if (format === 'jpg') image.jpeg({ quality: 88, mozjpeg: true });
      let current = false;
      try { current = !force && (await stat(new URL(output,root))).mtimeMs >= originalStat.mtimeMs; } catch {}
      if (!current) await image.toFile(fileURLToPath(new URL(output, root)));
      variant[format] = { src: output, bytes: (await stat(new URL(output, root))).size };
    }
    entry.variants.push(variant);
  }
  manifest[path] = entry;
  console.log(`${stem}: ${width}x${height}, ${entry.originalBytes} bytes -> ${entry.variants.find(v=>v.width===800)?.avif.bytes || entry.variants[0].avif.bytes} bytes (AVIF card)`);
}
await writeFile(new URL('assets/optimized/manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
await sharp(fileURLToPath(new URL('assets/logo.png',root))).resize({width:192,withoutEnlargement:true}).webp({lossless:true}).toFile(fileURLToPath(new URL('assets/logo-mark.webp',root)));
