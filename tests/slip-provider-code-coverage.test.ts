/**
 * Slip-provider code coverage (2026-11-21).
 *
 * `POST /api/v1/payments/slip-verify` turns a provider verdict into a status
 * and a Thai sentence through two string maps. Nothing tied those maps to what
 * the providers can actually RETURN, and nothing tied the providers to the
 * maps, so both halves went wrong at once and neither showed up anywhere:
 *
 *   - `master` carried `SLIP_DELAYED` in BOTH maps for weeks while neither
 *     mapper could produce it (Slip2Go's 200404 said `INVALID_SLIP`, SlipOK
 *     could only reach the branch when it happened to be the primary
 *     provider). It looked shipped; it was not.
 *   - Conversely a provider could invent a code (`SLIP_DUPLICATE`, added by
 *     0d8bb9d) and fall through `statusByCode[code] ?? 502` with the generic
 *     message, reporting a payment that already succeeded as an upstream
 *     failure.
 *
 * Both are invisible to type checking because the maps are `Record<string, …>`
 * and the provider result is a union of string literals — a new literal widens
 * nothing and a new map key satisfies nothing.
 *
 * Directions:
 *
 *   SC1  every code the route maps is producible by at least one provider
 *        (a mapped code nobody can send is a dead branch).
 *   SC2  every code a provider can return has BOTH a status and a message
 *        (otherwise it answers 502 with the fallback sentence).
 *   SC3  the two maps are keyed identically, all statuses are 4xx/5xx and no
 *        message is empty — plus parser guards, so a refactor cannot make the
 *        scan vacuously pass.
 *   SC4  negative control: the scanner, run on a synthetic route + mapper that
 *        reproduce the historical bug, still reports both failures. Without
 *        it, deleting a provider file would make SC1 pass on an empty set.
 *   SC5  every verdict an admin can see has a short Thai label
 *        (`src/lib/slipCheckReason.ts`), and no label names a code that cannot
 *        happen — the orders row used to print `RECEIVER_UNCONFIGURED` raw.
 *
 * Static, no imports of the route: its maps are function-local, so the only
 * way to read them is the source. `code: '…'` returns are the mappers' output;
 * a code named only in the result-type union is not producible and is
 * deliberately not counted. The route's own `code: '…'` literals count as
 * producers too: `RECEIVER_MISMATCH` (receiver policy) and
 * `RECEIVER_UNCONFIGURED` (refused auto-verify) never come from a provider.
 *
 * Deliberately NOT checked: route-only codes that never enter these maps
 * (`ORDER_NOT_PAYABLE`, `NO_PENDING_ATTEMPT`, `SLIP_ALREADY_USED`, …). They
 * are separate responses, not map keys, and asserting them here would be a
 * different gate.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SLIP_CHECK_LABELS } from '@/lib/slipCheckReason';

const SRC = path.join(__dirname, '..', 'src');
const ROUTE_FILE = path.join(SRC, 'app/api/v1/payments/slip-verify/route.ts');

interface ProviderSource {
  name: string;
  file: string;
  /** Marker that identifies the mapping function inside the provider module. */
  mapper: string;
}

const PROVIDERS: ProviderSource[] = [
  {
    name: 'slip2go',
    file: path.join(SRC, 'lib/payment/slip2go.ts'),
    mapper: 'function mapSlip2GoError',
  },
  {
    name: 'slipok',
    file: path.join(SRC, 'lib/payment/slipok.ts'),
    mapper: 'function mapSlipOkError',
  },
];

/** Blank comments but keep every newline, so line numbers in errors survive. */
const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** The balanced `{ … }` body that follows `marker` in `src`. */
function block(src: string, marker: string): string {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`gate scanner: "${marker}" not found — the source moved?`);
  const open = src.indexOf('{', at);
  if (open < 0) throw new Error(`gate scanner: no body after "${marker}"`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`gate scanner: unbalanced body for "${marker}"`);
}

const CODE_KEY = /^\s*([A-Z][A-Z0-9_]+)\s*:/gm;
const CODE_RETURN = /\bcode:\s*'([A-Z][A-Z0-9_]+)'/g;

/** Keys of one `const <name>: Record<string, …> = { … }` map. */
function mapCodes(src: string, name: string): string[] {
  const body = block(stripComments(src), name);
  return [...body.matchAll(CODE_KEY)].map((m) => m[1]!);
}

/** Codes a provider's mapper can actually return (not just name in a union). */
function producedCodes(src: string, mapper: string): string[] {
  const body = block(stripComments(src), mapper);
  return [...new Set([...body.matchAll(CODE_RETURN)].map((m) => m[1]!))];
}

/** Verdicts the route itself assigns to `result.code` (no provider involved). */
function routeOwnCodes(src: string): string[] {
  return [...new Set([...stripComments(src).matchAll(CODE_RETURN)].map((m) => m[1]!))];
}

interface Audit {
  status: string[];
  messages: string[];
  /** provider → codes it can return. */
  produced: Map<string, string[]>;
  /** Mapped by the route, producible by nobody. */
  deadInRoute: string[];
  /** Producible, but the route has no status and/or no message for it. */
  unmapped: string[];
}

function audit(routeSrc: string, providers: { name: string; src: string; mapper: string }[]): Audit {
  const status = mapCodes(routeSrc, 'statusByCode');
  const messages = mapCodes(routeSrc, 'msgByCode');
  const produced = new Map<string, string[]>();
  for (const p of providers) produced.set(p.name, producedCodes(p.src, p.mapper));
  produced.set('route', routeOwnCodes(routeSrc));

  const allProduced = new Set([...produced.values()].flat());
  const deadInRoute = status.filter((c) => !allProduced.has(c));

  const unmapped: string[] = [];
  for (const [name, codes] of produced) {
    for (const code of codes) {
      const gaps = [
        status.includes(code) ? null : 'status',
        messages.includes(code) ? null : 'message',
      ].filter((g): g is string => g !== null);
      if (gaps.length) unmapped.push(`${name}:${code} (no ${gaps.join(', no ')})`);
    }
  }
  return { status, messages, produced, deadInRoute, unmapped };
}

// The route's OWN refusals (no provider involved) live in slipVerifyFlow.ts
// since 2026-11-23, so the background re-check applies the same rule. Scan that
// file too, or `RECEIVER_UNCONFIGURED` reads as a dead branch in the route.
const FLOW_FILE = path.join(SRC, 'lib/payment/slipVerifyFlow.ts');

const realAudit = audit(readFileSync(ROUTE_FILE, 'utf8') + '\n' + readFileSync(FLOW_FILE, 'utf8'), [
  ...PROVIDERS.map((p) => ({ name: p.name, src: readFileSync(p.file, 'utf8'), mapper: p.mapper })),
]);

describe('slip-verify → provider code coverage', () => {
  it('SC1: every code the route maps is producible by a provider', () => {
    expect(realAudit.status.length, 'no routes codes parsed — the scanner broke').toBeGreaterThan(5);
    expect(
      realAudit.deadInRoute,
      'The route maps codes no provider can return, so that branch can never ' +
        'fire (SLIP_DELAYED lived here for weeks). Either teach a mapper to ' +
        'return it, or delete the entry:\n' +
        realAudit.deadInRoute.map((c) => `  - ${c}`).join('\n'),
    ).toEqual([]);
  });

  it('SC2: every code a provider can return has a status AND a message', () => {
    const total = [...realAudit.produced.values()].flat().length;
    expect(total, 'no provider codes parsed — the scanner broke').toBeGreaterThan(5);
    expect(
      realAudit.unmapped,
      'These provider verdicts fall through to `?? 502` / the generic sentence:\n' +
        realAudit.unmapped.map((u) => `  - ${u}`).join('\n'),
    ).toEqual([]);
  });

  it('SC3: the maps are keyed identically, with real statuses and non-empty messages', () => {
    expect([...realAudit.messages].sort()).toEqual([...realAudit.status].sort());

    const route = stripComments(readFileSync(ROUTE_FILE, 'utf8'));
    const statusBody = block(route, 'statusByCode');
    const badStatus = [...statusBody.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*:\s*(\d+)/gm)]
      .filter((m) => Number(m[2]) < 400 || Number(m[2]) > 599)
      .map((m) => `${m[1]}: ${m[2]}`);
    expect(badStatus, 'a mapped status is not a 4xx/5xx').toEqual([]);

    const messageBody = block(route, 'msgByCode');
    const empty = [...messageBody.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*:\s*''/gm)].map((m) => m[1]);
    expect(empty, 'a mapped message is an empty string').toEqual([]);

    // Every provider that ships a mapper must be listed here — a third one
    // would otherwise be invisible to both directions above.
    expect([...realAudit.produced.keys()]).toEqual(['slip2go', 'slipok', 'route']);
    // Spot-check the parser found the codes we know exist in both.
    for (const code of ['INVALID_SLIP', 'RECEIVER_MISMATCH']) {
      expect(realAudit.status).toContain(code);
      expect([...realAudit.produced.values()].flat()).toContain(code);
    }
  });

  it('SC5: every verdict an admin can see has a Thai label, and no label is orphaned', () => {
    const missing = realAudit.status.filter((c) => !SLIP_CHECK_LABELS[c]);
    expect(
      missing,
      'The orders row reads this map; without an entry the admin sees the raw code:\n' +
        missing.map((c) => `  - ${c}`).join('\n'),
    ).toEqual([]);

    // The other direction: a label for a code nothing can stamp is dead text.
    const reachable = new Set([
      ...realAudit.status,
      ...[...realAudit.produced.values()].flat(),
    ]);
    const orphans = Object.keys(SLIP_CHECK_LABELS).filter((c) => !reachable.has(c));
    expect(orphans, 'labels for codes that can never be shown:\n' + orphans.join('\n')).toEqual(
      [],
    );

    for (const [code, label] of Object.entries(SLIP_CHECK_LABELS)) {
      expect(label, code).not.toBe(code);
      // A label that is still Latin text is the code with extra steps.
      expect(/[\u0E00-\u0E7F]/.test(label), `${code}: "${label}" has no Thai text`).toBe(true);
      // It has to fit a 200 px table cell.
      expect(label.length, `${code} is too long for the chip`).toBeLessThanOrEqual(30);
    }
  });

  it('SC4: negative control — the scanner still reports a dead branch and an unmapped code', () => {
    // Reproduces 5a70a0e exactly: the route maps SLIP_DELAYED, the Slip2Go
    // mapper answers 200404 with INVALID_SLIP, and it also returns a code the
    // route has never heard of.
    const deadRoute = `
const statusByCode: Record<string, number> = {
  SLIP_DELAYED: 502,
  INVALID_SLIP: 422,
};
const msgByCode: Record<string, string> = {
  SLIP_DELAYED: 'รอสักครู่',
  INVALID_SLIP: 'สลิปไม่ถูกต้อง',
};
`;
    const deadMapper = `
function mapSlip2GoError(code: string, message: string) {
  switch (code) {
    case '200404':
      return { ok: false, code: 'INVALID_SLIP', detail: message };
    default:
      return { ok: false, code: 'SLIP_NOT_MAPPED_YET', detail: message };
  }
}
`;
    const a = audit(deadRoute, [
      { name: 'slip2go', src: deadMapper, mapper: 'function mapSlip2GoError' },
    ]);
    expect(a.deadInRoute).toEqual(['SLIP_DELAYED']);
    expect(a.unmapped).toEqual(['slip2go:SLIP_NOT_MAPPED_YET (no status, no message)']);
  });
});
