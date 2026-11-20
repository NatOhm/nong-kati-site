#!/usr/bin/env node
/**
 * scripts/check-sellable.mjs — is there anything a customer can actually buy?
 *
 * WHY THIS EXISTS
 * `/api/v1/health` answers one question: can the app reach its database? On
 * 2026-11-19 the shop answered `database: ok` on every check while serving 29
 * published products with a sellable total of ZERO — every variant had run out
 * of stock and the last 13 `available` GiftCodes were detached from any variant
 * (`variantId IS NULL`), so they counted as inventory, appeared in no product
 * row, and could never be delivered. The storefront rendered normally and
 * nothing could be bought. No monitor looked at that at all.
 *
 * WHAT IT CHECKS
 * `GET /api/v1/internal/sellable-health` (read-only, `x-cron-token`) returns
 * `sellableUnits`, `publishedProducts`, `sellableProducts` and
 * `detachedAvailableCodes`. Two conditions are failures, by definition:
 *
 *   · sellableUnits < --min-sellable (default 1) — nothing can be handed over
 *   · detachedAvailableCodes > 0 — codes that count but can never be delivered
 *
 * The verdict is computed HERE from the numbers, never read from the endpoint's
 * own `ok` field: a bug in the endpoint must not be able to silence the check
 * that exists to catch a bug in the shop.
 *
 * USAGE
 *   NK_CRON_SECRET=… node scripts/check-sellable.mjs
 *   node scripts/check-sellable.mjs --url https://nongkatistore.com --min-sellable 1
 *
 * Exit codes (the alerting contract, same shape as monitor-health.mjs):
 *   0 = sellable
 *   1 = NOT sellable — zero deliverable stock, or detached available codes
 *   2 = the check could not run (no token, 401/503, 404 because the endpoint is
 *       not deployed yet, unreachable, unreadable payload). Never read 2 as a
 *       shop outage: it means the checker is broken or misconfigured.
 *
 * Only node: builtins are used, so it runs in a bare CI runner with no install.
 */

// ── Defaults ────────────────────────────────────────────────────────────
const DEFAULTS = {
  url: 'https://nongkatistore.com',
  path: '/api/v1/internal/sellable-health',
  timeoutMs: 15000,
  /**
   * One unit is enough to call the shop sellable. The question is not "is the
   * stock level healthy" (that is the admin's slow-stock report) but "can a
   * customer buy anything at all".
   */
  minSellable: 1,
};

// ── Tiny arg parser (no deps) ───────────────────────────────────────────
const FLAG_ALIASES = {
  url: 'url',
  path: 'path',
  token: 'token',
  'timeout-ms': 'timeoutMs',
  'min-sellable': 'minSellable',
  webhook: 'webhook',
  help: 'help',
};

export function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const flag = arg.slice(2);
    const key = FLAG_ALIASES[flag] ?? flag;
    if (key === 'help') return { ...opts, help: true };
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i++;
    }
  }
  return opts;
}

// ── Verdict ─────────────────────────────────────────────────────────────
/**
 * Decide whether the payload describes a sellable shop.
 *
 * Pure and side-effect free so the contract can be pinned without a network.
 * `payload.ok` is deliberately ignored — see the file header.
 *
 * @param {object} payload  the endpoint's JSON body
 * @param {object} [opts]   { minSellable }
 * @returns {{ok: boolean, unusable: boolean, problems: string[]}}
 */
export function evaluateSellability(payload, opts = {}) {
  const minSellable = Number(opts.minSellable ?? DEFAULTS.minSellable);
  const sellableUnits = Number(payload?.sellableUnits);
  const detached = Number(payload?.detachedAvailableCodes);

  if (!Number.isFinite(sellableUnits) || !Number.isFinite(detached)) {
    // A 200 that carries no counts is a broken endpoint, not a broken shop:
    // report it as unusable so the run is never read as an outage.
    return {
      ok: false,
      unusable: true,
      problems: ['response carries no numeric sellableUnits/detachedAvailableCodes'],
    };
  }

  const problems = [];

  if (sellableUnits < minSellable) {
    const published = Number(payload?.publishedProducts);
    const sellableProducts = Number(payload?.sellableProducts);
    problems.push(
      `sellable stock is ${sellableUnits} (minimum ${minSellable}) — ` +
        `${Number.isFinite(published) ? published : '?'} published products, ` +
        `${Number.isFinite(sellableProducts) ? sellableProducts : '?'} with anything to sell`,
    );
  }

  if (detached !== 0) {
    problems.push(
      `${detached} available GiftCode(s) are detached from any variant — they count as ` +
        'inventory but can never be delivered',
    );
  }

  return { ok: problems.length === 0, unusable: false, problems };
}

// ── Alert delivery ──────────────────────────────────────────────────────
/**
 * Optional webhook (Slack/Discord/Line). Delivery failure is reported but does
 * not change the exit code — the verdict is the signal, and a broken webhook
 * must not mask it. Body carries both `text` (Slack/Line) and `content`
 * (Discord), because Discord silently ignores `text`.
 */
async function sendWebhook(url, message) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: message, content: message }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.warn(`⚠ webhook returned HTTP ${res.status}`);
  } catch (err) {
    console.warn(`⚠ webhook delivery failed: ${err?.message ?? err}`);
  }
}

/** The `error` field of an error body, or a short slice of whatever came back. */
function detail(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch {
    // not JSON — fall through to the raw slice
  }
  return text.slice(0, 200);
}

// ── Main ────────────────────────────────────────────────────────────────
export async function main(argv = process.argv.slice(2), env = process.env) {
  const opts = parseArgs(argv);

  if (opts.help) {
    console.log(
      [
        'Sellable-stock check — can a customer buy anything at all?',
        '',
        'Flags:',
        `  --url <base>            default ${DEFAULTS.url}`,
        `  --path <path>           default ${DEFAULTS.path}`,
        '  --token <value>         cron token (or NK_CRON_SECRET from the env)',
        `  --min-sellable <n>      default ${DEFAULTS.minSellable}`,
        `  --timeout-ms <n>        default ${DEFAULTS.timeoutMs}`,
        '  --webhook <url>         POST {"text","content"} when the shop is unsellable',
        '',
        'Exit: 0 sellable / 1 not sellable / 2 the check could not run',
      ].join('\n'),
    );
    return 0;
  }

  const baseUrl = String(opts.url ?? DEFAULTS.url).replace(/\/+$/, '');
  const path = String(opts.path ?? DEFAULTS.path);
  const timeoutMs = Number(opts.timeoutMs ?? DEFAULTS.timeoutMs);
  const minSellable = Number(opts.minSellable ?? DEFAULTS.minSellable);
  const webhook = opts.webhook ?? null;
  const token = String(opts.token ?? env.NK_CRON_SECRET ?? '');

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    console.error(`✖ --timeout-ms must be a positive number (got ${opts.timeoutMs})`);
    return 2;
  }
  if (!Number.isFinite(minSellable) || minSellable < 0) {
    console.error(`✖ --min-sellable must be zero or more (got ${opts.minSellable})`);
    return 2;
  }
  if (!token) {
    console.error(
      '✖ no cron token — set NK_CRON_SECRET (or --token). The endpoint answers 401 ' +
        'without it, and 503 when the server itself has no NK_CRON_SECRET.',
    );
    return 2;
  }

  const url = `${baseUrl}${path}`;
  let res;
  let text;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: 'application/json',
        'x-cron-token': token,
        'user-agent': 'nong-kati-sellable-check/1.0',
      },
    });
    text = await res.text();
  } catch (err) {
    console.error(`✖ cannot reach ${url} — ${err?.message ?? err}`);
    return 2;
  }

  if (res.status === 404) {
    console.error(
      `✖ ${url} answered HTTP 404 — this build does not carry the endpoint yet ` +
        '(it ships with the next deploy). The check cannot run, and that is NOT a shop outage.',
    );
    return 2;
  }
  if (res.status === 401 || res.status === 503) {
    console.error(
      `✖ ${url} answered HTTP ${res.status} (${detail(text)}) — the check cannot authenticate: ` +
        'the repo secret and the server NK_CRON_SECRET must be the same value.',
    );
    return 2;
  }
  if (!res.ok) {
    console.error(`✖ ${url} answered HTTP ${res.status} — ${detail(text)}`);
    return 2;
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    console.error(`✖ ${url} did not return JSON: ${text.slice(0, 200)}`);
    return 2;
  }

  const verdict = evaluateSellability(body, { minSellable });
  if (verdict.unusable) {
    console.error(`✖ ${verdict.problems[0]}`);
    return 2;
  }

  const counts =
    `${body.sellableUnits} sellable unit(s) across ` +
    `${body.sellableProducts}/${body.publishedProducts} published products, ` +
    `${body.detachedAvailableCodes} detached available code(s)`;

  if (!verdict.ok) {
    const line = `NOT SELLABLE — ${verdict.problems.join('; ')}`;
    console.error(`✖ ${line}`);
    // GitHub renders ::error:: as a red annotation, but only from stdout.
    process.stdout.write(
      `::error title=nongkatistore.com cannot sell::${line.replace(/\n/g, ' ')}\n`,
    );
    if (webhook) await sendWebhook(String(webhook), `🚨 nongkatistore.com — ${line}`);
    return 1;
  }

  console.log(`✓ sellable — ${counts}`);
  return 0;
}

// Only run when invoked directly, so tests can import the pure helpers.
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      console.error(`✖ sellable check error: ${err?.message ?? err}`);
      process.exit(2);
    });
}
