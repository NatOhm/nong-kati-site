#!/usr/bin/env node
/**
 * scripts/check-node-version.mjs — the pin has one owner, and CI asserts it.
 *
 * Production runs Node 20.20.2 under Passenger (`docs/hostatom-live.md`), while
 * every CI job used to install 24. A test suite that runs on a Node the shop
 * never executes cannot catch a host-only break, and Prisma 5 / Next 15 are
 * exactly the kind of dependencies that notice a major.
 *
 * `.nvmrc` names the exact version; `package.json#engines.node` names the range
 * that may boot. This script fails when:
 *   · the running Node's major differs from `.nvmrc`
 *   · the running Node is outside the engines range
 *   · `.nvmrc` itself is outside the engines range
 *
 * Exit: 0 consistent · 1 the pin contradicts itself or the runner.
 */
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const major = (value) => Number(String(value).replace(/^v/, '').split('.')[0]);

const pin = read('.nvmrc').trim();
const pkg = JSON.parse(read('package.json'));
const range = String(pkg.engines?.node ?? '');
const actual = process.versions.node;

const bounds = /^>=\s*(\d+)\.\d+\s+<\s*(\d+)$/.exec(range.trim());
if (!bounds) {
  console.error(`✖ engines.node must look like ">=20.19 <21" — found "${range || '(none)'}"`);
  process.exit(1);
}
const minMajor = Number(bounds[1]);
const maxMajor = Number(bounds[2]);

const problems = [];
if (!pin) problems.push('.nvmrc is empty');
if (pin && major(actual) !== major(pin)) problems.push(`running Node ${actual}, .nvmrc pins ${pin}`);
if (major(actual) < minMajor || major(actual) >= maxMajor) {
  problems.push(`Node ${actual} is outside engines.node "${range}"`);
}
if (pin && (major(pin) < minMajor || major(pin) >= maxMajor)) {
  problems.push(`.nvmrc ${pin} is outside engines.node "${range}"`);
}

if (problems.length > 0) {
  console.error('✖ node version pin:');
  for (const p of problems) console.error(`   ${p}`);
  console.error('   Fix: align .nvmrc, package.json#engines and the Plesk Node.js version.');
  process.exit(1);
}

console.log(`✔ Node ${actual} matches .nvmrc ${pin} and engines.node "${range}"`);
