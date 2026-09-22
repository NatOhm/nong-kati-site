'use client';

/**
 * Floating "Print / Save as PDF" button for the printable manual page.
 * Client component only because of window.print(); the manual document
 * itself stays server-rendered.
 */
export function PrintButton(): React.JSX.Element {
  return (
    <button type="button" className="print-btn" onClick={() => window.print()}>
      🖨️ พิมพ์ / บันทึกเป็น PDF
    </button>
  );
}
