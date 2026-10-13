/**
 * Respan gateway wiring — the part that needs no key and no network.
 *
 * Respan is configured through one env key (RESPAN_API_KEY) against one
 * OpenAI-compatible gateway endpoint. Two things silently rot if nothing
 * checks them:
 *
 *   1. the base URL — a typo or a wrong host (e.g. api.respan.ai/v1) makes
 *      every call miss the gateway, so no fallbacks, caching, or spend limits
 *      ever apply, and the failure looks like a normal LLM error;
 *   2. the routing fields — an empty `fallback_models` list sent on purpose
 *      would clear the org's dashboard chain, so buildRespanParams must omit
 *      fields that were never asked for.
 *
 * This gate reads the SDK-free config module (`src/lib/ai/respanConfig`), so it
 * runs on `npm test` before the `openai` / `@respan/respan` packages are
 * installed. The SDK-touching module (`src/lib/ai/respan`) is exercised by the
 * live gateway check in the docs, which needs RESPAN_API_KEY.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  RESPAN_GATEWAY_BASE_URL,
  buildRespanParams,
  getRespanApiKey,
  getRespanBaseUrl,
  isRespanConfigured,
} from '@/lib/ai/respanConfig';

afterEach(() => {
  delete process.env['RESPAN_API_KEY'];
  delete process.env['RESPAN_BASE_URL'];
});

describe('Respan gateway configuration', () => {
  it('defaults to the unified Respan gateway endpoint', () => {
    expect(RESPAN_GATEWAY_BASE_URL).toBe('https://api.respan.ai/api/');
    expect(getRespanBaseUrl()).toBe('https://api.respan.ai/api/');
  });

  it('honours a Respan Enterprise endpoint override', () => {
    process.env['RESPAN_BASE_URL'] = 'https://endpoint.respan.ai/api';
    expect(getRespanBaseUrl()).toBe('https://endpoint.respan.ai/api');

    process.env['RESPAN_BASE_URL'] = '   ';
    expect(getRespanBaseUrl()).toBe(RESPAN_GATEWAY_BASE_URL);
  });

  it('treats the key as absent until a non-blank RESPAN_API_KEY is set', () => {
    expect(getRespanApiKey()).toBeUndefined();
    expect(isRespanConfigured()).toBe(false);

    process.env['RESPAN_API_KEY'] = '  ';
    expect(getRespanApiKey()).toBeUndefined();
    expect(isRespanConfigured()).toBe(false);

    process.env['RESPAN_API_KEY'] = 'rsp_test_123';
    expect(getRespanApiKey()).toBe('rsp_test_123');
    expect(isRespanConfigured()).toBe(true);
  });

  it('maps fallbacks, caching and customer/thread tags to Respan fields', () => {
    expect(
      buildRespanParams({
        fallbackModels: ['claude-sonnet-4-5-20250929', 'gemini-2.5-pro'],
        cache: { ttlSeconds: 86400 },
        customerIdentifier: 'user_8842',
        threadIdentifier: 'thread_7f3a',
        metadata: { feature: 'support-chat' },
      }),
    ).toEqual({
      fallback_models: ['claude-sonnet-4-5-20250929', 'gemini-2.5-pro'],
      cache_enabled: true,
      cache_ttl: 86400,
      customer_identifier: 'user_8842',
      thread_identifier: 'thread_7f3a',
      metadata: { feature: 'support-chat' },
    });
  });

  it('emits no Respan field that was not requested', () => {
    expect(buildRespanParams({})).toEqual({});
    // An empty fallback list must never be sent — it would clear the org's
    // dashboard fallback chain instead of leaving it alone.
    expect(buildRespanParams({ fallbackModels: [] })).toEqual({});
    // Caching without a TTL still turns caching on (the gateway defaults to 30m).
    expect(buildRespanParams({ cache: {} })).toEqual({ cache_enabled: true });
  });
});
