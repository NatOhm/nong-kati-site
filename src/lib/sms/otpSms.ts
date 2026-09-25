/**
 * OTP SMS delivery — Twilio REST API, with an explicit dev fallback.
 *
 * - Production: NK_TWILIO_ACCOUNT_SID / NK_TWILIO_AUTH_TOKEN /
 *   NK_TWILIO_FROM_NUMBER must be set, otherwise the request route answers
 *   503 SMS_UNAVAILABLE and the UI hides the phone tab.
 * - Dev/test: NK_OTP_DEV_MODE=1 logs the code to the server console instead
 *   of sending (visible in `npm run dev` output) so the flow is testable
 *   without a Twilio account.
 */

export function isSmsConfigured(): boolean {
  if (process.env['NK_OTP_DEV_MODE'] === '1') return true;
  return Boolean(
    process.env['NK_TWILIO_ACCOUNT_SID'] &&
      process.env['NK_TWILIO_AUTH_TOKEN'] &&
      process.env['NK_TWILIO_FROM_NUMBER'],
  );
}

/**
 * Send the OTP via SMS. Returns false when delivery could not be attempted
 * or failed — the caller treats it like the magic-link email failure case
 * (uniform response, no enumeration).
 */
export async function sendOtpSms(params: { to: string; code: string }): Promise<boolean> {
  const body = `รหัสเข้าสู่ระบบ Nong-Kati: ${params.code} (ใช้ได้ 5 นาที ห้ามบอกใคร)`;

  // Dev mode: log instead of sending so the flow is testable end-to-end.
  if (process.env['NK_OTP_DEV_MODE'] === '1') {
    console.info(`[otp-dev] OTP for ${params.to}: ${params.code}`);
    return true;
  }

  const sid = process.env['NK_TWILIO_ACCOUNT_SID'];
  const token = process.env['NK_TWILIO_AUTH_TOKEN'];
  const from = process.env['NK_TWILIO_FROM_NUMBER'];
  if (!sid || !token || !from) return false;

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        To: params.to,
        From: from,
        Body: body,
      }).toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
