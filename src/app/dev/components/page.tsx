'use client';

import { Download, Search } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Divider } from '@/components/ui/Divider';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { RadioGroup } from '@/components/ui/RadioGroup';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { Tooltip } from '@/components/ui/Tooltip';
import { Alert } from '@/components/feedback/Alert';
import { Modal } from '@/components/feedback/Modal';
import { Drawer } from '@/components/feedback/Drawer';
import { Spinner } from '@/components/loading/Spinner';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { useTheme } from '@/hooks/useTheme';

/** Internal QA aid only — never linked from customer-facing nav. See app/robots.ts. */
export default function ComponentsPreviewPage(): React.JSX.Element {
  const { theme, toggle } = useTheme();
  const [checked, setChecked] = useState(false);
  const [toggled, setToggled] = useState(true);
  const [radio, setRadio] = useState('promptpay');
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen space-y-10 bg-ink-900 p-8 text-ink-50">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">M1 Component Preview — theme: {theme}</h1>
        <Button variant="secondary" onClick={toggle}>
          สลับธีม
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-amber-300">Button</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-amber-300">IconButton</h2>
        <div className="flex gap-3">
          <IconButton icon={<Search size={20} />} label="ค้นหา" />
          <IconButton icon={<Download size={20} />} label="ดาวน์โหลด" badge={3} />
        </div>
      </section>

      <section className="max-w-sm space-y-3">
        <h2 className="text-lg font-semibold text-amber-300">Input / Select</h2>
        <Input label="อีเมล" placeholder="you@example.com" hint="ใช้สำหรับรับโค้ด" />
        <Input label="มีข้อผิดพลาด" error="กรุณากรอกอีเมลให้ถูกต้อง" />
        <Select
          label="หมวดหมู่"
          value="gaming"
          onChange={() => {}}
          options={[
            { value: 'gaming', label: 'เกม' },
            { value: 'streaming', label: 'สตรีมมิ่ง' },
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-amber-300">Checkbox / RadioGroup / Toggle</h2>
        <Checkbox checked={checked} onChange={setChecked} label="ยอมรับเงื่อนไขการใช้งาน" />
        <RadioGroup
          name="payment"
          value={radio}
          onChange={setRadio}
          options={[
            { value: 'promptpay', label: 'PromptPay' },
            { value: 'card', label: 'บัตรเครดิต' },
          ]}
        />
        <Toggle checked={toggled} onChange={setToggled} label="รับข่าวสาร" />
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <h2 className="w-full text-lg font-semibold text-amber-300">Badge</h2>
        <Badge variant="success" label="ส่งโค้ดแล้ว" />
        <Badge variant="error" label="ล้มเหลว" />
        <Badge variant="warning" label="สต็อคต่ำ" />
        <Badge variant="info" label="กำลังดำเนินการ" />
        <Badge variant="neutral" label="รอชำระเงิน" />
        <Badge variant="brand" label="แนะนำ" />
      </section>

      <Divider label="หรือ" />

      <section className="flex items-center gap-3">
        <h2 className="w-full text-lg font-semibold text-amber-300">Tooltip / Spinner / Skeleton</h2>
        <Tooltip content="คัดลอกรหัส">
          <Button variant="ghost">Hover me</Button>
        </Tooltip>
        <Spinner size="md" />
        <SkeletonBlock className="h-6 w-40" />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-amber-300">Alert</h2>
        <Alert type="success" title="ชำระเงินสำเร็จ" message="โค้ดถูกส่งไปยังอีเมลแล้ว" />
        <Alert type="error" message="เกิดข้อผิดพลาดในการชำระเงิน" dismissible onDismiss={() => {}} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-amber-300">Modal / Drawer</h2>
        <div className="flex gap-3">
          <Button onClick={() => setModalOpen(true)}>เปิด Modal</Button>
          <Button onClick={() => setDrawerOpen(true)}>เปิด Drawer</Button>
        </div>
        <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="ตัวอย่าง Modal" description="ข้อความอธิบาย">
          <p className="text-sm text-ink-300">เนื้อหาภายใน Modal</p>
        </Modal>
        <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title="ตัวอย่าง Drawer">
          <p className="text-sm text-ink-300">เนื้อหาภายใน Drawer</p>
        </Drawer>
      </section>
    </div>
  );
}
