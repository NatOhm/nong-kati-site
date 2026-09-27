/**
 * Email Service — Resend HTTP integration.
 * 17-folder.md §14 — lib/email/resend.ts
 * 10-digital-code.md §9.2 — 3× exponential backoff retry.
 *
 * Real client uses the Resend REST API directly (no SDK dependency):
 * POST https://api.resend.com/emails with the server-only API key.
 *
 * Env vars:
 *   NK_RESEND_API_KEY   (server-only; required — there is NO mock success)
 *   NK_RESEND_FROM_EMAIL (e.g. "orders@nong-kati.co.th"; required)
 *
 * External audit #2 (2026-09-27): the old mock mode returned
 * `{ success: true, messageId: 'mock_...' }` whenever the API key was
 * missing — production without the key reported deliveries that never
 * happened, and callers told customers their codes were emailed.
 *
 * The client is now FAIL-CLOSED: without real credentials every send
 * returns `{ success: false, error: 'EMAIL_NOT_CONFIGURED: ... }` (no
 * network call, no retries — configuration cannot heal by retrying).
 * Callers report failure honestly: the outbox parks the email as pending/
 * failed for redelivery, and the auth routes answer 503 instead of a
 * fake success. Local dev/tests that need a fake provider inject one via
 * vitest module mocks — never via a magic API key.
 */

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * True when real delivery is configured. Routes that must not lie to users
 * (magic link, password reset, checkout success copy) consult this to fail
 * fast with an honest error instead of enqueueing into a void.
 */
export function isEmailDeliveryConfigured(): boolean {
  const key = process.env['NK_RESEND_API_KEY'];
  return Boolean(key) && key !== 're_mock_key' && Boolean(process.env['NK_RESEND_FROM_EMAIL']);
}

interface ResendSendResponse {
  id?: string;
  message?: string;
  name?: string;
}

/** One POST to the Resend API. Throws on network failure / non-2xx. */
async function resendSend(options: EmailOptions): Promise<string> {
  const apiKey = process.env['NK_RESEND_API_KEY'];
  const from = process.env['NK_RESEND_FROM_EMAIL'];

  if (!apiKey) {
    throw new Error('EMAIL_NOT_CONFIGURED: NK_RESEND_API_KEY is not set');
  }
  if (!from) {
    throw new Error('EMAIL_NOT_CONFIGURED: NK_RESEND_FROM_EMAIL is not set');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        ...(options.text ? { text: options.text } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('EMAIL_TIMEOUT: Resend API did not respond in time');
    }
    throw new Error(`EMAIL_NETWORK_ERROR: ${err instanceof Error ? err.message : 'unknown'}`);
  }
  clearTimeout(timeout);

  const body = (await res.json().catch(() => ({}))) as ResendSendResponse;
  if (!res.ok) {
    throw new Error(`EMAIL_PROVIDER_ERROR: Resend ${res.status} ${body.message ?? ''}`.trim());
  }
  if (!body.id) {
    throw new Error('EMAIL_PROVIDER_ERROR: Resend response missing message id');
  }
  return body.id;
}

/**
 * Send an email via Resend. FAIL-CLOSED (audit #2): without real
 * credentials this returns success:false immediately — no fake message id,
 * no retries (configuration errors cannot heal by retrying).
 * 10-digital-code.md §9.2 — Retried 3× exponential backoff (2s, 4s, 8s).
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (!isEmailDeliveryConfigured()) {
    const missing = process.env['NK_RESEND_API_KEY'] ? 'NK_RESEND_FROM_EMAIL' : 'NK_RESEND_API_KEY';
    console.error(`[Email] NOT CONFIGURED — set ${missing} (mock success is no longer returned)`);
    return {
      success: false,
      error: `EMAIL_NOT_CONFIGURED: ${missing} is not set`,
    };
  }

  try {
    const messageId = await resendSend(options);
    return { success: true, messageId };
  } catch (err) {
    // Configuration errors must NOT be retried — retrying cannot fix a
    // missing env var, and each retry burns the request budget.
    if (err instanceof Error && err.message.startsWith('EMAIL_NOT_CONFIGURED')) {
      console.error('[Email]', err.message);
      return { success: false, error: err.message };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown email error',
    };
  }
}

/**
 * Send email with retry (3× exponential backoff).
 * 10-digital-code.md §9.2 — notification_logs retry pattern.
 */
export async function sendEmailWithRetry(
  options: EmailOptions,
  maxRetries: number = 3,
): Promise<EmailResult> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, Math.min(delay, 5000)));
    }

    const result = await sendEmail(options);
    if (result.success) {
      return result;
    }
    lastError = result.error;
  }

  return {
    success: false,
    error: lastError ?? 'Max retries exceeded',
  };
}
