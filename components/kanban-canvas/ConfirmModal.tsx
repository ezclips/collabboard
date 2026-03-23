'use client';

import { useKanbanI18n } from './useKanbanI18n';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  confirmClass?: string;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Delete',
  confirmClass = 'bg-red-600 hover:bg-red-700',
  isLoading = false,
}: ConfirmModalProps) {
  const { t } = useKanbanI18n();
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!isLoading) {
      onConfirm();
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <div
      className="kanban-dialog-overlay"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="kanban-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="kanban-dialog-title">{title}</h2>

        <p className="kanban-dialog-message">{message}</p>

        <div className="kanban-dialog-actions">
          <button
            onClick={onClose}
            className="kanban-dialog-btn kanban-dialog-btn-cancel"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`kanban-dialog-btn ${isLoading ? 'kanban-dialog-btn-disabled' : confirmClass}`}
          >
            {isLoading ? t('processing') : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
