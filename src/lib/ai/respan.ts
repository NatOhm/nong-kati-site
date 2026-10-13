/**
 * Respan — one gateway for every model, plus tracing.
 *
 * This is the single place the app talks to an LLM. Both the gateway client
 * and the tracer use the same RESPAN_API_KEY:
 *
 *   - Gateway: an OpenAI-compatible client whose base URL is the Respan
 *     gateway, so switching provider is only a change to `model`. Respan adds
 *     automatic fallback models, response caching, and the spend limits set on
 *     the key in the dashboard.
 *   - Tracing: the Respan SDK auto-instruments the OpenAI SDK, so every
 *     gateway call — plus the tool/retrieval steps wrapped in
 *     `withRespanWorkflow` — arrives as a span with inputs, outputs, latency,
 *     tokens, and cost.
 *
 * Requires the packages from the Respan docs:
 *   npm install openai @respan/respan
 *
 * Docs: https://www.respan.ai/docs/integrations/gateway/open-ai-sdk and
 *       https://www.respan.ai/docs/documentation/features/tracing/quickstart
 */
import { Respan } from '@respan/respan';
import OpenAI from 'openai';

import {
  buildRespanParams,
  getRespanApiKey,
  getRespanBaseUrl,
  isRespanConfigured,
  type RespanRoutingOptions,
} from '@/lib/ai/respanConfig';

export {
  RESPAN_GATEWAY_BASE_URL,
  getRespanApiKey,
  isRespanConfigured,
  type RespanRoutingOptions,
} from '@/lib/ai/respanConfig';

/** A minimal chat message; the gateway takes the OpenAI chat format. */
export interface RespanMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RespanChatOptions extends RespanRoutingOptions {
  /** A model slug, e.g. "gpt-5.5" or "claude-sonnet-4-5-20250929". */
  model: string;
  messages: RespanMessage[];
}

export interface RespanChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface RespanChatResult {
  text: string;
  model: string;
  usage: RespanChatUsage | null;
}

/** The shape we read off the gateway response (OpenAI chat completions). */
interface GatewayChatCompletion {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

let gatewayClient: OpenAI | undefined;

/**
 * The shared OpenAI client pointed at the Respan gateway. Every model call the
 * app makes should go through this so routing, caching, and tracing apply.
 */
export function getRespanGatewayClient(): OpenAI {
  const apiKey = getRespanApiKey();
  if (!apiKey) {
    throw new Error('RESPAN_API_KEY is not set — the Respan gateway cannot be called.');
  }
  gatewayClient ??= new OpenAI({ apiKey, baseURL: getRespanBaseUrl() });
  return gatewayClient;
}

/**
 * Call any model through the Respan gateway.
 *
 * The gateway accepts Respan fields (fallback_models, cache_enabled, …) that
 * are not part of the OpenAI SDK's types, so the call is typed through a
 * narrow local shape rather than the SDK's parameter union.
 */
export async function createRespanChatCompletion(
  options: RespanChatOptions,
  client: OpenAI = getRespanGatewayClient(),
): Promise<RespanChatResult> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    ...buildRespanParams(options),
  };

  const create = client.chat.completions.create.bind(
    client.chat.completions,
  ) as unknown as (body: Record<string, unknown>) => Promise<GatewayChatCompletion>;

  const completion = await create(body);
  const usage = completion.usage;

  return {
    text: completion.choices?.[0]?.message?.content ?? '',
    model: completion.model ?? options.model,
    usage: usage
      ? {
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        }
      : null,
  };
}

let tracer: Respan | undefined;
let tracerReady: Promise<void> | undefined;

/** The shared Respan tracing SDK instance (reads RESPAN_API_KEY). */
export function getRespanTracer(): Respan {
  if (!isRespanConfigured()) {
    throw new Error('RESPAN_API_KEY is not set — Respan tracing cannot be initialized.');
  }
  tracer ??= new Respan();
  return tracer;
}

/** Initialize tracing once, before the first model call. Safe to await twice. */
export function initializeRespanTracing(): Promise<void> {
  if (tracerReady === undefined) {
    // Normalise the SDK's own return value to Promise<void> so the shared
    // guard is idempotent whatever initialize() resolves to.
    tracerReady = Promise.resolve(getRespanTracer().initialize()).then(() => undefined);
  }
  return tracerReady;
}

/**
 * Run one agent turn — or any multi-step block of model calls, tool runs, and
 * retrievals — as a single trace. The opening argument groups all spans inside.
 */
export async function withRespanWorkflow<T>(name: string, run: () => Promise<T> | T): Promise<T> {
  await initializeRespanTracing();
  return getRespanTracer().withWorkflow({ name }, async () => run());
}

/** Flush pending spans. Call before returning from a serverless handler. */
export async function flushRespanTracing(): Promise<void> {
  if (!tracer) return;
  await tracer.flush();
}
