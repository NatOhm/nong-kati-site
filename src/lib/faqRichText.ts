const ALLOWED_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'A', 'BR']);
/** Block-level tags browsers emit while typing Enter; normalized to line breaks. */
const BLOCK_TAGS = new Set(['DIV', 'P', 'LI']);

// Built from char code so the entity source stays unambiguous.
const AMP = String.fromCharCode(38) + 'amp;';
const LT = String.fromCharCode(38) + 'lt;';
const GT = String.fromCharCode(38) + 'gt;';
const QUOT = String.fromCharCode(38) + 'quot;';

/** Keep FAQ formatting intentionally small and safe for both admin preview and public output. */
export function sanitizeFaqHtml(input: string): string {
  return (
    input
      .replace(/<!--[\s\S]*?-->/g, '')
      // Drop executable/embedded containers along with their contents.
      .replace(
        /<(script|style|iframe|object|embed|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        '',
      )
      .replace(/<\/?([a-z][\w:-]*)\b([^>]*)>/gi, (full, tagName: string, attrs: string) => {
        const tag = tagName.toUpperCase();
        const isClose = full.startsWith('</');
        if (BLOCK_TAGS.has(tag)) return isClose ? '' : '<br />';
        if (!ALLOWED_TAGS.has(tag)) return '';
        if (tag === 'BR') return isClose ? '' : '<br />';
        if (isClose) return `</${tag.toLowerCase()}>`;
        if (tag !== 'A') return `<${tag.toLowerCase()}>`;

        const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '';
        if (!/^(https?:\/\/|mailto:)/i.test(href)) return '<a>';
        const escapedHref = href.replace(/&/g, AMP).replace(/"/g, QUOT);
        return `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer">`;
      })
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(?:<br \/>\s*){2,}/g, '<br />')
  );
}

/** Escape plain text so it can be inserted into the editor as safe HTML. */
export function escapeFaqText(text: string): string {
  return text.replace(/&/g, AMP).replace(/</g, LT).replace(/>/g, GT).replace(/"/g, QUOT);
}

export function faqHtmlToText(input: string): string {
  return sanitizeFaqHtml(input)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00A0/g, ' ')
    .replaceAll(QUOT, '"')
    .replaceAll(LT, '<')
    .replaceAll(GT, '>')
    .replaceAll(AMP, '&')
    .trim();
}

/** Sanitized HTML, or '' when the answer carries no visible text. */
export function faqAnswerValue(input: string): string {
  const sanitized = sanitizeFaqHtml(input);
  return faqHtmlToText(sanitized) ? sanitized : '';
}
