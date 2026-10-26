#!/usr/bin/env node
/**
 * scripts/dedupe-variants.mjs — repair duplicate variants created by the old
 * PUT /api/v1/admin/products/[id] replace-all logic (client feedback
 * 19 Oct: "อยู่ ๆ ตัวเลือกก็เพิ่มขึ้น" — the live HBO Max product carried 6
 * variants, 5 labeled "default").
 *
 * For every (product, label) group with more than ONE variant it picks a
 * keeper and makes sure exactly that variant is active:
 *   keeper = most gift codes (fulfilment picks codes by exact variantId, so
 *            the variant that OWNS the codes must be the sellable one),
 *            tie-broken by order history, then newest createdAt.
 * Every other variant in the group is DEACTIVATED — never deleted: order
 * items, stock moves and inventory snapshots all reference these rows.
 *
 * Usage:
 *   node scripts/dedupe-variants.mjs           # DRY RUN — report only
 *   node scripts/dedupe-variants.mjs --apply   # deactivate the extras
 *
 * The report prints stock and available-code counts per row so drift between
 * the keeper's stock and its actual codes is visible BEFORE anything changes.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');

function die(msg) {
  console.error(`✖ ${msg}`);
  process.exit(2);
}

// ── Env loading (no dotenv dependency; .env.local wins, matching Next.js) ──
for (const f of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2];
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[m[1]] === undefined && val !== '') process.env[m[1]] = val;
    }
  } catch {
    /* file may not exist */
  }
}

const dbUrl = process.env['DATABASE_DIRECT_URL'] || process.env['DATABASE_URL'];
if (!dbUrl) die('DATABASE_URL not found (looked in env, .env.local, .env)');

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      variants: {
        select: {
          id: true,
          label: true,
          stock: true,
          isActive: true,
          sortOrder: true,
          createdAt: true,
          _count: {
            select: {
              giftCodes: true,
              orderItems: true,
              stockMoves: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const actions = []; // { product, label, keeper, deactivate: [] }
  for (const p of products) {
    const byLabel = new Map();
    for (const v of p.variants) {
      const list = byLabel.get(v.label) ?? [];
      list.push(v);
      byLabel.set(v.label, list);
    }
    for (const [label, group] of byLabel) {
      if (group.length < 2) continue;
      // Keeper: owns the gift codes first (fulfilment reads codes by exact
      // variantId), then order history, then newest row. The final id
      // comparison makes the choice DETERMINISTIC — createdAt ties (bulk
      // createMany shares one timestamp) plus equal codes/orders let
      // Postgres' arbitrary tie order flip the keeper between runs.
      const keeper = [...group].sort(
        (a, b) =>
          b._count.giftCodes - a._count.giftCodes ||
          b._count.orderItems - a._count.orderItems ||
          b.createdAt - a.createdAt ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )[0];
      const activeRows = group.filter((v) => v.isActive);
      // Whole option hidden on purpose — leave it alone.
      if (activeRows.length === 0) continue;
      // Exactly one sellable row and no stranded codes on the keeper: the
      // group is already clean. Acting would only swap which arbitrary
      // tie-break row is active and flip-flop on every run.
      if (
        activeRows.length === 1 &&
        activeRows[0].id !== keeper.id &&
        keeper._count.giftCodes === 0
      ) {
        continue;
      }
      const deactivate = group.filter((v) => v.id !== keeper.id && v.isActive);
      // Reactivate the keeper only while the option is actually selling —
      // and only when that matters (it owns codes the active row lacks).
      const keeperNeedsReactivate = !keeper.isActive;
      if (deactivate.length === 0 && !keeperNeedsReactivate) continue; // already clean
      actions.push({ product: p, label, keeper, deactivate, group, keeperNeedsReactivate });
    }
  }

  console.log(`\n── Duplicate variant groups: ${actions.length} ──────────────────────────`);
  for (const a of actions) {
    console.log(`\n• ${a.product.name}  (${a.product.slug})`);
    console.log(`  label: "${a.label}"  — ${a.group.length} rows`);
    for (const v of a.group) {
      const role = v.id === a.keeper.id ? 'KEEP' : v.isActive ? 'DEACTIVATE' : 'already off';
      console.log(
        `    [${role.padEnd(12)}] ${v.id}  active=${v.isActive}  stock=${v.stock}` +
          `  codes=${v._count.giftCodes}  orderItems=${v._count.orderItems}` +
          `  created=${v.createdAt.toISOString().slice(0, 19)}`,
      );
    }
    const keeperCodes = a.keeper._count.giftCodes;
    if (a.keeper.stock !== keeperCodes) {
      console.log(
        `    ⚠ keeper stock=${a.keeper.stock} but gift codes=${keeperCodes} — stock drift, review manually`,
      );
    }
    if (a.keeperNeedsReactivate) console.log('    → will REACTIVATE the keeper');
    for (const v of a.deactivate) console.log(`    → will deactivate ${v.id}`);
  }

  const totalRows = actions.reduce((n, a) => n + a.deactivate.length, 0);
  const reactivate = actions.filter((a) => a.keeperNeedsReactivate).length;
  console.log(
    `\nSummary: ${actions.length} groups, ${totalRows} rows to deactivate, ${reactivate} keepers to reactivate.`,
  );

  if (!APPLY) {
    console.log('\nDRY RUN — nothing changed. Re-run with --apply to perform these updates.');
    return;
  }
  if (actions.length === 0) {
    console.log('\nNothing to apply.');
    return;
  }

  // One transaction per group: small, restartable, no big lock window.
  let done = 0;
  for (const a of actions) {
    await prisma.$transaction(async (tx) => {
      await tx.productVariant.update({ where: { id: a.keeper.id }, data: { isActive: true } });
      if (a.deactivate.length > 0) {
        await tx.productVariant.updateMany({
          where: { id: { in: a.deactivate.map((v) => v.id) } },
          data: { isActive: false },
        });
      }
    });
    done += 1;
  }
  console.log(`\n✔ Applied: ${done} groups updated.`);
}

main()
  .catch((e) => {
    console.error('✖ dedupe failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
