/**
 * Circuit Breaker — Gateway resilience pattern.
 * 09-payment.md LD-14 — Wraps every OmiseAdapter call.
 *
 * States:
 *   closed   → normal operation, counting failures
 *   open     → failing fast, returns 503 to client
 *   half_open → probe with single request before closing
 *
 * Failure threshold: 5 consecutive errors
 * Open duration: 60 seconds before retry probe
 */

export class GatewayCircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private openedAt: number | null = null;

  private readonly FAILURE_THRESHOLD = 5;
  private readonly OPEN_DURATION_MS = 60_000; // 1 minute

  /**
   * Execute a gateway call through the circuit breaker.
   * Throws GatewayUnavailableError if circuit is open.
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.openedAt && Date.now() - this.openedAt < this.OPEN_DURATION_MS) {
        throw new GatewayUnavailableError(
          'Payment gateway temporarily unavailable. Please try again in a moment.',
        );
      }
      this.state = 'half_open';
    }

    try {
      const result = await fn();
      this.failures = 0;
      this.state = 'closed';
      return result;
    } catch (err) {
      this.failures++;
      if (this.failures >= this.FAILURE_THRESHOLD) {
        this.state = 'open';
        this.openedAt = Date.now();
        // In production, this would alert admin via admin_alert_log
        console.error(
          `[CircuitBreaker] Circuit OPEN after ${this.FAILURE_THRESHOLD} consecutive failures`,
        );
      }
      throw err;
    }
  }

  /** Get current circuit state (for monitoring/debugging) */
  getState(): { state: string; failures: number; openedAt: number | null } {
    return {
      state: this.state,
      failures: this.failures,
      openedAt: this.openedAt,
    };
  }

  /** Manually reset circuit (admin action) */
  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.openedAt = null;
  }
}

export class GatewayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayUnavailableError';
  }
}

/** Singleton circuit breaker instance */
export const gatewayCircuitBreaker = new GatewayCircuitBreaker();
