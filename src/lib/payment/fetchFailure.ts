/**
 * One line that says WHY an outbound provider call died (red-team 2026-11-24).
 *
 * Both adapters caught every `fetch` rejection with a bare `catch` and answered
 * `detail: 'network'`, which made three very different situations identical:
 * a provider outage, a timeout, and a bug in our own request construction
 * (a body type the runtime rejects never even opens a socket). A customer then
 * saw "ระบบตรวจสลิปขัดข้อง" and the operator had nothing to read. The
 * customer-facing wording stays vague on purpose; the LOG now carries the name,
 * errno code and message, so an outage can be told apart from a defect.
 */
export function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return `non-error thrown: ${String(err)}`;
  const cause = (err as { cause?: unknown }).cause;
  let code = '';
  if (cause && typeof cause === 'object' && 'code' in cause) {
    const raw = (cause as { code?: unknown }).code;
    if (typeof raw === 'string' || typeof raw === 'number') code = String(raw);
  }
  return `${err.name}${code ? `/${code}` : ''}: ${err.message}`;
}
