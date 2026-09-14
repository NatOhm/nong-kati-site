#!/usr/bin/env node
/**
 * Downloads product images from nongkatistore.com into public/products/
 * Run: node scripts/download-product-images.mjs
 * Requires .nks_all.json (fetched product API data) in the project root.
 */
import fs from 'fs';
import path from 'path';

const raw = fs.readFileSync('.nks_all.json', 'utf8');
const products = [];
for (const line of raw.split('\n')) {
  if (!line.trim()) continue;
  try {
    const j = JSON.parse(line);
    if (j.products) products.push(...j.products);
  } catch { /* skip malformed line */ }
}

const outDir = path.resolve('public/products');
fs.mkdirSync(outDir, { recursive: true });

const seen = new Set();
let ok = 0, fail = 0;

for (const p of products) {
  if (!p.imageUrl || seen.has(p.imageUrl)) continue;
  seen.add(p.imageUrl);
  const url = 'https://nongkatistore.com' + p.imageUrl;
  const filename = p.imageUrl.split('/').pop();
  const outPath = path.join(outDir, filename);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    console.log(`OK  ${filename} (${(buf.length / 1024).toFixed(0)} KB)`);
    ok++;
  } catch (e) {
    console.error(`FAIL ${filename}: ${e.message}`);
    fail++;
  }
}

console.log(`\nDone: ${ok} downloaded, ${fail} failed -> ${outDir}`);
