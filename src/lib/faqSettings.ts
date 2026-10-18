import { faqAnswerValue } from '@/lib/faqRichText';

/** One FAQ row as stored under SiteSetting key 'faq' (answer = sanitized HTML). */
export interface FaqItem {
  question: string;
  answer: string;
  order: number;
}

/** Expected shape stored under SiteSetting key 'faq'. */
export interface FaqSettings {
  /** Storefront visibility of the whole FAQ section. Defaults to true so a
   *  row written before this flag existed keeps showing its questions. */
  enabled: boolean;
  items: FaqItem[];
}

/** Parse and sanitize the stored 'faq' value; anything unusable is dropped. */
export function parseFaqSettings(value: string): FaqSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = null;
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'items' in parsed &&
    Array.isArray((parsed as { items: unknown }).items)
  ) {
    const raw = (parsed as { items: unknown[] }).items;
    const enabled =
      'enabled' in parsed && typeof (parsed as { enabled: unknown }).enabled === 'boolean'
        ? ((parsed as { enabled: boolean }).enabled)
        : true;
    const items: FaqItem[] = [];
    for (let i = 0; i < raw.length; i += 1) {
      const row = raw[i];
      if (typeof row !== 'object' || row === null) continue;
      const r = row as Record<string, unknown>;
      const question = typeof r['question'] === 'string' ? r['question'].trim() : '';
      const answer = typeof r['answer'] === 'string' ? faqAnswerValue(r['answer']) : '';
      const order = typeof r['order'] === 'number' && Number.isFinite(r['order']) ? r['order'] : i;
      if (!question || !answer) continue;
      items.push({ question, answer, order });
    }
    items.sort((a, b) => a.order - b.order);
    return { enabled, items };
  }
  return { enabled: true, items: [] };
}

/** Build the normalized FaqSettings the API accepts/returns from a PUT body. */
export function normalizeFaqBody(body: Record<string, unknown>, current: FaqSettings): FaqSettings {
  // Visibility is an independent switch: it must survive an empty item list
  // (toggling the section off with no questions saved is a legitimate edit).
  const enabled =
    typeof body['enabled'] === 'boolean' ? body['enabled'] : current.enabled;
  const incoming = Array.isArray(body['items']) ? body['items'] : null;
  const items: FaqItem[] = [];
  if (incoming) {
    for (let i = 0; i < incoming.length; i += 1) {
      const row = incoming[i];
      if (typeof row !== 'object' || row === null) continue;
      const r = row as Record<string, unknown>;
      const question = typeof r['question'] === 'string' ? r['question'].trim() : '';
      const answer = typeof r['answer'] === 'string' ? faqAnswerValue(r['answer']) : '';
      const order = typeof r['order'] === 'number' && Number.isFinite(r['order']) ? r['order'] : i;
      if (!question || !answer) continue;
      items.push({ question, answer, order });
    }
  }
  if (items.length === 0) {
    // No usable items in the payload → keep the stored questions, still apply
    // the visibility flag (the old `return current` silently dropped it).
    return { enabled, items: current.items };
  }
  items.sort((a, b) => a.order - b.order);
  return { enabled, items };
}
