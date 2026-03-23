'use client';

import { useState } from 'react';

export interface InputModalState {
  isOpen: boolean;
  title: string;
  message?: string;
  initialValue: string;
  placeholder?: string;
  inputType?: 'text' | 'number';
  onConfirm: (value: string) => void;
}

export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  confirmClass?: string;
  onConfirm: () => void;
}

export function useKanbanModals() {
  const [inputModal, setInputModal] = useState<InputModalState>({
    isOpen: false,
    title: '',
    initialValue: '',
    onConfirm: () => {},
  });

  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showInputModal = (config: Omit<InputModalState, 'isOpen'>) => {
    setInputModal({ ...config, isOpen: true });
  };

  const closeInputModal = () => {
    setInputModal((prev) => ({ ...prev, isOpen: false }));
  };

  const showConfirmModal = (config: Omit<ConfirmModalState, 'isOpen'>) => {
    setConfirmModal({ ...config, isOpen: true });
  };

  const closeConfirmModal = () => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  return {
    inputModal,
    confirmModal,
    showInputModal,
    closeInputModal,
    showConfirmModal,
    closeConfirmModal,
  };
}
