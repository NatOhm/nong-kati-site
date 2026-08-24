/**
 * PDPA Data Request Page — 02-user-flow.md UF-17.
 * Customer-facing form for data subject requests.
 */

import type { Metadata } from 'next';
import { DataRequestForm } from '@/components/pdpa/DataRequestForm';

export const metadata: Metadata = {
  title: 'ขอจัดการข้อมูลส่วนบุคคล — Nong-Kati',
  description: 'ส่งคำขอเข้าถึง แก้ไข ลบ หรือโอนย้ายข้อมูลส่วนบุคคลของคุณ',
};

export default function DataRequestPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold text-ink-100">ขอจัดการข้อมูลส่วนบุคคล</h1>
      <p className="mb-6 text-sm text-ink-400">
        ภายใต้ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 คุณมีสิทธิ์ขอจัดการข้อมูลส่วนบุคคลของคุณ
      </p>

      <div className="rounded-md border border-ink-700 bg-ink-850 p-6">
        <DataRequestForm />
      </div>

      <p className="mt-4 text-xs text-ink-500">
        เราจะดำเนินการคำขอภายใน 30 วันทำการ หากมีคำถาม กรุณาติดต่อ{' '}
        <a href="mailto:privacy@nong-kati.co.th" className="text-amber-400 hover:text-amber-300">
          privacy@nong-kati.co.th
        </a>
      </p>
    </div>
  );
}
