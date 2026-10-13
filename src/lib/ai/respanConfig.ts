/**
 * Respan configuration — the parts that do not touch an SDK.
 *
 * Respan routes every model through one OpenAI-compatible gateway
 * (https://api.respan.ai/api/) and records each call as a span. This module
 * holds the gateway URL, the API-key lookup, and the mapping from our routing
 * options to Respan's request fields (fallback models, response caching, and
 * the customer/thread tags shown in Logs). Keeping it free of SDK imports
 * lets the pure behaviour be tested without a network call or a key.
 *
 * Env:
 *   RESPAN_API_KEY  — one key for the gateway and for tracing (required to call out)
 *   RESPAN_BASE_URL — Respan Enterprise endpoint override (defaults to api.respan.ai)
 *
 * Docs: https://www.respan.ai/docs/integrations/gateway/open-ai-sdk
 */

/** The unified Respan gateway endpoint (OpenAI-compatible, 1000+ models). */
export const RESPAN_GATEWAY_BASE_URL = 'https://api.respan.ai/api/';

/** Gateway base URL, honouring a Respan Enterprise override. */
export function getRespanBaseUrl(): string {
  const override = process.env['RESPAN_BASE_URL']?.trim();
  return override && override.length > 0 ? override : RESPAN_GATEWAY_BASE_URL;
}

/** The Respan API key, or undefined when it is unset or blank. */
export function getRespanApiKey(): string | undefined {
  const key = process.env['RESPAN_API_KEY']?.trim();
  return key && key.length > 0 ? key : undefined;
}

/** True once RESPAN_API_KEY is present, so callers can fail closed knowingly. */
export function isRespanConfigured(): boolean {
  return getRespanApiKey() !== undefined;
}

/** Model-routing options sent to the Respan gateway for one call. */
export interface RespanRoutingOptions {
  /** Models the gateway tries in order when the primary model fails. */
  fallbackModels?: string[];
  /** Reuse an identical request's stored response instead of calling the model. */
  cache?: { ttlSeconds?: number };
  /** The end user this call belongs to; drives Respan Users and their budgets. */
  customerIdentifier?: string;
  /** Groups the turns of one conversation in Logs. */
  threadIdentifier?: string;
  /** Free-form tags shown under the log's Custom properties. */
  metadata?: Record<string, string>;
}

/**
 * Map our routing options to Respan's request fields. Only set fields are
 * emitted, so we never send an empty list that would clear a dashboard default.
 *
 * Spend limits are not a per-request field: they live on the API key
 * (Gateway › API keys) and on per-customer budgets in the Respan dashboard.
 */
export function buildRespanParams(options: RespanRoutingOptions): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  if (options.fallbackModels && options.fallbackModels.length > 0) {
    params['fallback_models'] = [...options.fallbackModels];
  }
  if (options.cache) {
    params['cache_enabled'] = true;
    if (options.cache.ttlSeconds !== undefined) {
      params['cache_ttl'] = options.cache.ttlSeconds;
    }
  }
  if (options.customerIdentifier) params['customer_identifier'] = options.customerIdentifier;
  if (options.threadIdentifier) params['thread_identifier'] = options.threadIdentifier;
  if (options.metadata && Object.keys(options.metadata).length > 0) {
    params['metadata'] = { ...options.metadata };
  }

  return params;
}
