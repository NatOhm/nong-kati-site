/**
 * Email transport configuration — the ONE owner of "who do we send as, and
 * can we send at all?".
 *
 * Extracted 2026-10-31 (audit finding 2). The sender address used to have
 * two owners: the env var the mailer read, and a `fromEmail` field in the
 * admin `email` SiteSetting that the settings page wrote and nothing read
 * back. An admin could change the dashboard value, see "saved", and mail
 * still left as the env value. There is now one answer, and the dashboard
 * only DISPLAYS it (GET /api/v1/admin/settings/email returns `liveSender`),
 * so a screen can no longer contradict the wire.
 *
 * The environment is the truth by design: Plesk's panel holds only the
 * Infisical machine identity, and server.js injects the rest at boot.
 *
 * FAIL-CLOSED, no mock success (external audit #2): a half-configured
 * mailer reports `configured: false` and every caller must treat that as
 * "no mail", never as "sent".
 */

export const RESEND_API_KEY_VAR = 'NK_RESEND_API_KEY';
export const RESEND_FROM_VAR = 'NK_RESEND_FROM_EMAIL';

/** A key that can actually authenticate — the legacy `re_mock_key` cannot. */
export function resendApiKey(): string | null {
  const key = process.env[RESEND_API_KEY_VAR];
  if (!key || key === 're_mock_key') return null;
  return key;
}

/** The exact From header, e.g. `Nong-Kati <noreply@nongkatistore.com>`. */
export function emailSender(): string | null {
  const from = process.env[RESEND_FROM_VAR];
  return from && from.trim() !== '' ? from : null;
}

/** True only when BOTH halves exist — routes use this to fail fast, honestly. */
export function isEmailDeliveryConfigured(): boolean {
  return resendApiKey() !== null && emailSender() !== null;
}

/** The env var an operator still has to set, or null when nothing is missing. */
export function missingEmailConfig(): typeof RESEND_API_KEY_VAR | typeof RESEND_FROM_VAR | null {
  if (resendApiKey() === null) return RESEND_API_KEY_VAR;
  if (emailSender() === null) return RESEND_FROM_VAR;
  return null;
}
