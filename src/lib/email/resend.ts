/**
 * Email Service — Resend HTTP integration.
 * 17-folder.md §14 — lib/email/resend.ts
 * 10-digital-code.md §9.2 — 3× exponential backoff retry.
 *
 * Real client uses the Resend REST API directly (no SDK dependency):
 * POST https://api.resend.com/emails with the server-only API key.
 *
 * Env vars:
 *   NK_RESEND_API_KEY   (server-only; absent => mock mode for local dev)
 *   NK_RESEND_FROM_EMAIL (e.g. "orders@nong-kati.co.th"; required in real mode)
 *
 * Mock mode (no key / re_mock_key): logs and returns success so local dev
 * and unit tests never depend on network egress. Production must set the
 * key — a real deployment without one surfaces as FAILED at send time
 * rather than silently claiming delivery.
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

function isMockMode(): boolean {
  const key = process.env['NK_RESEND_API_KEY'];
  return !key || key === 're_mock_key';
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
 * Send an email via Resend (or mock when no API key is configured).
 * 10-digital-code.md §9.2 — Retried 3× exponential backoff (2s, 4s, 8s).
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (isMockMode()) {
    console.log(`[Email Mock] To: ${options.to}, Subject: ${options.subject}`);
    return {
      success: true,
      messageId: `mock_${Date.now()}`,
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
