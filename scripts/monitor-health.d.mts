/**
 * Type declarations for scripts/monitor-health.mjs.
 *
 * The monitor is plain ESM JavaScript so it runs on a bare Node install with
 * no build step (that is the whole point — it has to run in a CI runner and on
 * any ops machine). Its shape is still part of the contract that
 * tests/prod-health-monitor.test.ts depends on, so it is declared here rather
 * than silenced with an `any` import.
 */

export interface HealthSample {
  /** False when the request could not be completed at all (DNS, TLS, timeout). */
  ok: boolean;
  httpStatus: number | null;
  /** Parsed /api/v1/health body, or a synthetic {status:'unparseable'} wrapper. */
  body: Record<string, unknown> | null;
  error: string | null;
  latencyMs: number;
}

export interface MonitorState {
  lastCheckAt?: number;
  lastUptime?: number | null;
  lastVerdict?: string;
  consecutiveFailures?: number;
  restarts?: Array<{ at: string; previousUptime: number | null; uptime: number }>;
}

export interface MonitorOptions {
  url: string;
  healthPath: string;
  statePath: string;
  historyPath: string;
  timeoutMs: number;
  /** A reset after at least this much idle is an expected reap, not an alert. */
  idleReapSeconds: number;
  /** Uptime is read at two instants; this absorbs poll/clock jitter. */
  uptimeToleranceSeconds: number;
  /** Consecutive failures required before alerting. */
  failureThreshold: number;
  maxHistoryInState: number;
  webhook?: string | boolean;
  help?: boolean;
}

export interface MonitorEvent {
  type: 'baseline' | 'restart' | 'idle-reap' | 'unreachable' | 'unhealthy' | 'no-uptime-field';
  [key: string]: unknown;
}

export interface EvaluationResult {
  verdict: 'ok' | 'restart' | 'idle-reap' | 'unreachable' | 'unhealthy';
  events: MonitorEvent[];
  shouldAlert: boolean;
}

export declare function parseArgs(argv: string[]): MonitorOptions;

export declare function evaluateSample(input: {
  prev: MonitorState | null;
  sample: HealthSample;
  now: number;
  opts?: Partial<MonitorOptions>;
}): EvaluationResult;

export declare function readState(path: string): MonitorState | null;

export declare function writeState(path: string, state: MonitorState): void;

export declare function appendHistory(path: string, record: Record<string, unknown>): void;

export declare function fetchHealth(params: {
  baseUrl: string;
  healthPath: string;
  timeoutMs: number;
}): Promise<HealthSample>;

/** Resolves to the process exit code: 0 ok / 1 alert / 2 monitor error. */
export declare function main(argv?: string[], env?: Record<string, string | undefined>): Promise<number>;