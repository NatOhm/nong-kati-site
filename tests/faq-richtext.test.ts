import { describe, expect, it } from 'vitest';

import { escapeFaqText, faqAnswerValue, faqHtmlToText, sanitizeFaqHtml } from '@/lib/faqRichText';

// Entity literals are assembled at runtime so the expectations stay readable.
const AMP = '&' + 'amp;';
const LT = '&' + 'lt;';
const GT = '&' + 'gt;';
const QUOT = '&' + 'quot;';

describe('FAQ rich-text sanitization', () => {
  it('keeps bold and http(s)/mailto links, hardening link targets', () => {
    expect(sanitizeFaqHtml('<strong>ลด 10%</strong> ภายใน 7 วัน')).toBe(
      '<strong>ลด 10%</strong> ภายใน 7 วัน',
    );

    expect(sanitizeFaqHtml('<a href="https://line.me/R/ti/p/@shop?a=1&b=2">LINE</a>')).toBe(
      '<a href="https://line.me/R/ti/p/@shop?a=1' +
        AMP +
        'b=2" target="_blank" rel="noopener noreferrer">LINE</a>',
    );

    expect(sanitizeFaqHtml('<a href="mailto:hi@example.com">อีเมล</a>')).toBe(
      '<a href="mailto:hi@example.com" target="_blank" rel="noopener noreferrer">อีเมล</a>',
    );
  });

  it('strips scripts, styles, event handlers, and dangerous link protocols', () => {
    expect(
      sanitizeFaqHtml('<b>ฉัน</b><script>alert(1)</script> <span style="color:red">โควิด</span>'),
    ).toBe('<b>ฉัน</b> โควิด');

    expect(sanitizeFaqHtml('<a href="javascript:alert(1)">คลิก</a>')).toBe('<a>คลิก</a>');
    expect(sanitizeFaqHtml('<a href="https://x.com" onclick="steal()">ลิงก์</a>')).toBe(
      '<a href="https://x.com" target="_blank" rel="noopener noreferrer">ลิงก์</a>',
    );
    expect(sanitizeFaqHtml('http://ok.example ไม่แตะ')).toBe('http://ok.example ไม่แตะ');
  });

  it('normalizes browser block markup into line breaks', () => {
    expect(sanitizeFaqHtml('บรรทัด1<div>บรรทัด2</div>')).toBe('บรรทัด1<br />บรรทัด2');
    expect(sanitizeFaqHtml('a<br><br>b')).toBe('a<br />b');
  });

  it('extracts visible text and rejects markup-only answers', () => {
    expect(faqHtmlToText('<strong>ส่ง</strong> 1-3 วัน<br />ครับ')).toBe('ส่ง 1-3 วัน\nครับ');
    expect(faqAnswerValue('<strong></strong><br />')).toBe('');
    expect(faqAnswerValue('จัดส่งภายใน 1-3 วัน')).toBe('จัดส่งภายใน 1-3 วัน');
  });

  it('escapes plain text before it is pasted into the editor', () => {
    expect(escapeFaqText('a & b <c> "d"')).toBe(
      'a ' + AMP + ' b ' + LT + 'c' + GT + ' ' + QUOT + 'd' + QUOT,
    );
  });
});
