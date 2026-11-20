/**
 * Type declarations for scripts/check-sellable.mjs.
 *
 * The checker is plain ESM JavaScript so it runs on a bare Node install with no
 * build step (it has to run in a CI runner and on any ops machine). Its shape is
 * still part of the contract `tests/prod-health-monitor.test.ts` depends on, so
 * it is declared here rather than silenced with a permissive `any` import.
 */

export interface SellablePayload {
  /** Σ min(stock, available codes) over active variants of published products. */
  sellableUnits?: unknown;
  publishedProducts?: unknown;
  sellableProducts?: unknown;
  /** `available` GiftCodes with no variant — inventory that can never ship. */
  detachedAvailableCodes?: unknown;
  /** Informational only: the checker recomputes the verdict from the numbers. */
  ok?: unknown;
  checkedAt?: unknown;
}

export interface SellableOptions {
  url: string;
  path: string;
  timeoutMs: number;
  /** Below this many deliverable units the shop is not sellable. */
  minSellable: number;
  token?: string | boolean;
  webhook?: string | boolean;
  help?: boolean;
}

export interface SellableVerdict {
  ok: boolean;
  /** True when the payload carried no numeric counts — exit 2, not an outage. */
  unusable: boolean;
  problems: string[];
}

export declare function parseArgs(argv: string[]): SellableOptions;

export declare function evaluateSellability(
  payload: SellablePayload | null | undefined,
  opts?: { minSellable?: number },
): SellableVerdict;

/** Resolves to the process exit code: 0 sellable / 1 not sellable / 2 cannot run. */
export declare function main(
  argv?: string[],
  env?: Record<string, string | undefined>,
): Promise<number>;
