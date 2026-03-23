'use client';

import { useState, useEffect, useRef } from 'react';
import { useKanbanI18n } from './useKanbanI18n';

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  inputType?: 'text' | 'number';
}

export function InputModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  initialValue = '',
  placeholder = '',
  inputType = 'text',
}: InputModalProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useKanbanI18n();

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      // Focus input after modal opens
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="kanban-dialog-overlay"
      onClick={onClose}
    >
      <div
        className="kanban-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="kanban-dialog-title">{title}</h2>

        {message && <p className="kanban-dialog-message">{message}</p>}

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type={inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="kanban-dialog-input"
          />

          <div className="kanban-dialog-actions">
            <button
              type="button"
              onClick={onClose}
              className="kanban-dialog-btn kanban-dialog-btn-cancel"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="kanban-dialog-btn kanban-dialog-btn-primary"
            >
              {t('ok')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
