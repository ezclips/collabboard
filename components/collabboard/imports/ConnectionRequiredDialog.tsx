'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, AlertCircle } from 'lucide-react';
import type { ImportProvider } from '@/lib/imports/types';

interface ConnectionRequiredDialogProps {
  provider: ImportProvider;
  onClose: () => void;
  onBack: () => void;
}

const PROVIDER_LABELS: Record<ImportProvider, string> = {
  'google-drive': 'Google Drive',
  'microsoft-onedrive': 'Microsoft OneDrive',
};

export default function ConnectionRequiredDialog({
  provider,
  onClose,
  onBack,
}: ConnectionRequiredDialogProps) {
  const label = PROVIDER_LABELS[provider];

  // Portaled to document.body — this dialog can be reached while a Radix
  // Dialog (CanvasSettingsModal, WallpaperSelector) is still open above it in
  // the tree, and a plain nested fixed div gets stuck fighting that dialog's
  // own overlay/focus-trap instead of receiving clicks.
  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[4200] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-800">Connection Required</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-amber-500" />
          </div>

          <div>
            <p className="text-gray-800 font-medium mb-2">
              {label} is not connected
            </p>
            <p className="text-sm text-gray-500">
              To import files from {label}, you need to connect your account
              in your integration settings first.
            </p>
          </div>

          <a
            href="/dashboard/settings/integrations"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors"
          >
            Go to Integration Settings
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onBack}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
