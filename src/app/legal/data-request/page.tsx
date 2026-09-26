/**
 * PDPA Data Request Page — 02-user-flow.md UF-17.
 * Customer-facing form for data subject requests.
 */

import type { Metadata } from 'next';
import { DataRequestForm } from '@/components/pdpa/DataRequestForm';

export const metadata: Metadata = {
  title: 'ขอจัดการข้อมูลส่วนบุคคล',
  description: 'ส่งคำขอเข้าถึง แก้ไข ลบ หรือโอนย้ายข้อมูลส่วนบุคคลของคุณ',
};

export default function DataRequestPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold text-fg">ขอจัดการข้อมูลส่วนบุคคล</h1>
      <p className="mb-6 text-sm text-fg-placeholder">
        ภายใต้ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 คุณมีสิทธิ์ขอจัดการข้อมูลส่วนบุคคลของคุณ
      </p>

      <div className="rounded-md border border-line-subtle bg-surface p-6">
        <DataRequestForm />
      </div>

      <p className="text-clay-9000 mt-4 text-xs">
        เราจะดำเนินการคำขอภายใน 30 วันทำการ หากมีคำถาม กรุณาติดต่อ{' '}
        <a href="mailto:privacy@nong-kati.co.th" className="text-fg-brand hover:text-fg-brand">
          privacy@nong-kati.co.th
        </a>
      </p>
    </div>
  );
}
