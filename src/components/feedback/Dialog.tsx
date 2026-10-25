import { Button } from '@/components/ui/Button';

import { Modal } from './Modal';

export interface DialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** default: "ยกเลิก" */
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  /** Extra body slot — refusal reasons, counts, linked order numbers. */
  children?: React.ReactNode;
}

/** 05-components.md §8.4 — confirmation dialog, built on Modal. Use for irreversible actions. */
export function Dialog({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = 'ยกเลิก',
  variant = 'default',
  onConfirm,
  onCancel,
  loading = false,
  children,
}: DialogProps): React.JSX.Element {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
