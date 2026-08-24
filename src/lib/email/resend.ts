/**
 * Email Service — Mock Resend integration.
 * 17-folder.md §14 — lib/email/resend.ts
 * 10-digital-code.md §9.2 — 3× exponential backoff retry.
 *
 * In production: Resend API (sandbox for staging).
 * For M4/M5 mock: logs to console, returns success.
 *
 * Env vars:
 *   NK_RESEND_API_KEY (server-only)
 *   NK_RESEND_FROM_EMAIL (e.g. "orders@nong-kati.co.th")
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

const isMock = !process.env['NK_RESEND_API_KEY'] || process.env['NK_RESEND_API_KEY'] === 're_mock_key';

/**
 * Send an email via Resend (or mock).
 * 10-digital-code.md §9.2 — Retried 3× exponential backoff (2s, 4s, 8s).
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  if (isMock) {
    console.log(`[Email Mock] To: ${options.to}, Subject: ${options.subject}`);
    return {
      success: true,
      messageId: `mock_${Date.now()}`,
    };
  }

  // Real Resend API call would go here
  // const resend = new Resend(process.env.NK_RESEND_API_KEY);
  // const { data, error } = await resend.emails.send({ from, to, subject, html });
  throw new Error('Real Resend API not implemented — use mock keys for staging');
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
