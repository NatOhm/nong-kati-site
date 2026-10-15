'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/utils/cn';
import { sanitizeFaqHtml } from '@/lib/faqRichText';
import type { FaqItem } from '@/lib/faqSettings';

/**
 * Public FAQ accordion. Rows are fetched server-side by the force-dynamic
 * homepage (getFaqSettings) and passed in as props — visitors never call the
 * permission-gated admin endpoint. Answers are sanitized rich text
 * (bold/links) rendered through dangerouslySetInnerHTML after allowlisting.
 */
export function FAQAccordion({ items }: { items: FaqItem[] }): React.JSX.Element {
  if (items.length === 0) {
    return (
      <section className="px-4 py-8 md:px-8">
        <h2 className="mb-6 text-center text-lg font-bold text-fg">คำถามที่พบบ่อย</h2>
        <div className="clay-card mx-auto max-w-2xl rounded-2xl border border-line-subtle bg-surface p-6 text-center text-sm text-fg-placeholder">
          ยังไม่มีคำถาม
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-8 md:px-8">
      <h2 className="mb-6 text-center text-lg font-bold text-fg">คำถามที่พบบ่อย</h2>
      <div className="clay-card mx-auto max-w-2xl rounded-2xl">
        {items.map((item, i) => (
          <FAQItem
            key={`${item.question}-${i}`}
            id={`faq-${i + 1}`}
            q={item.question}
            a={item.answer}
          />
        ))}
      </div>
    </section>
  );
}

function FAQItem({ q, a, id }: { q: string; a: string; id: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-line-subtle last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={`${id}-answer`}
        className="flex min-h-[44px] w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface"
      >
        <span className="pr-4 text-sm font-medium text-fg-secondary">{q}</span>
        {isOpen ? (
          <ChevronUp size={18} className="shrink-0 text-fg-brand" />
        ) : (
          <ChevronDown size={18} className="shrink-0 text-fg-placeholder" />
        )}
      </button>
      {/* Hidden answers stay out of the accessibility tree (audit #10). */}
      <div
        id={`${id}-answer`}
        hidden={!isOpen}
        className={cn(
          'transition-smart overflow-hidden duration-300',
          isOpen ? 'max-h-96' : 'max-h-0',
        )}
      >
        <div
          className="prose prose-sm max-w-none px-4 pb-4 leading-relaxed text-fg-muted"
          dangerouslySetInnerHTML={{ __html: sanitizeFaqHtml(a) }}
        />
      </div>
    </div>
  );
}
