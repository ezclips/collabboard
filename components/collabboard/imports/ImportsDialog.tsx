'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { ImportProvider, ResolvedImportItem } from '@/lib/imports/types';
import { getImportProviderStatus } from '@/lib/imports/clientApi';
import ConnectionRequiredDialog from './ConnectionRequiredDialog';
import ImportBrowser from './ImportBrowser';

interface ImportsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportResolved: (resolved: ResolvedImportItem) => void;
}

type Screen =
  | { name: 'chooser' }
  | { name: 'checking'; provider: ImportProvider }
  | { name: 'browser'; provider: ImportProvider }
  | { name: 'connection-required'; provider: ImportProvider };

function ProviderCard({
  provider,
  onSelect,
}: {
  provider: ImportProvider;
  onSelect: () => void;
}) {
  const isGoogle = provider === 'google-drive';

  return (
    <button
      onClick={onSelect}
      className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all group bg-white"
    >
      {isGoogle ? (
        <svg className="w-12 h-12" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
          <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 52H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
          <path d="M43.65 25L29.9 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 47.5A9 9 0 000 52h27.5z" fill="#00ac47"/>
          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.65 9.2z" fill="#ea4335"/>
          <path d="M43.65 25L57.4 0H29.9z" fill="#00832d"/>
          <path d="M59.8 52h27.5L73.55 28c-.8-1.4-1.95-2.5-3.3-3.3L57.4 0 43.65 25z" fill="#2684fc"/>
          <path d="M27.5 52L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L59.8 52z" fill="#ffba00"/>
        </svg>
      ) : (
        <svg className="w-12 h-12" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 0h22.5v22.5H0z" fill="#F25022"/>
          <path d="M25.5 0H48v22.5H25.5z" fill="#7FBA00"/>
          <path d="M0 25.5h22.5V48H0z" fill="#00A4EF"/>
          <path d="M25.5 25.5H48V48H25.5z" fill="#FFB900"/>
        </svg>
      )}
      <div className="text-center">
        <p className="font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">
          {isGoogle ? 'Google Drive' : 'Microsoft OneDrive'}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {isGoogle ? 'Import from Google Drive' : 'Import from OneDrive'}
        </p>
      </div>
    </button>
  );
}

export default function ImportsDialog({ isOpen, onClose, onImportResolved }: ImportsDialogProps) {
  const [screen, setScreen] = useState<Screen>({ name: 'chooser' });

  // Reset to chooser whenever dialog opens
  useEffect(() => {
    if (isOpen) setScreen({ name: 'chooser' });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProviderSelect = async (provider: ImportProvider) => {
    setScreen({ name: 'checking', provider });

    try {
      const status = await getImportProviderStatus(provider);
      if (status.connected) {
        setScreen({ name: 'browser', provider });
      } else {
        setScreen({ name: 'connection-required', provider });
      }
    } catch {
      setScreen({ name: 'connection-required', provider });
    }
  };

  // Connection required modal (rendered on top)
  if (screen.name === 'connection-required') {
    return (
      <ConnectionRequiredDialog
        provider={screen.provider}
        onClose={onClose}
        onBack={() => setScreen({ name: 'chooser' })}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[1100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div
        className="bg-white rounded-xl shadow-2xl w-full animate-in fade-in zoom-in duration-200 overflow-hidden"
        style={{ maxWidth: screen.name === 'browser' ? '720px' : '480px', height: screen.name === 'browser' ? '80vh' : 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            {screen.name !== 'chooser' && screen.name !== 'checking' && (
              <button
                onClick={() => setScreen({ name: 'chooser' })}
                className="text-sm text-gray-500 hover:text-gray-800 mr-1"
              >
                &larr;
              </button>
            )}
            <h2 className="text-lg font-bold text-gray-800">
              {screen.name === 'chooser' || screen.name === 'checking'
                ? 'Import File'
                : screen.name === 'browser'
                  ? (screen.provider === 'google-drive' ? 'Import from Google Drive' : 'Import from Microsoft OneDrive')
                  : 'Import File'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        {(screen.name === 'chooser' || screen.name === 'checking') && (
          <div className="p-6">
            {screen.name === 'checking' ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <p className="text-sm text-gray-500">Checking connection...</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-5 text-center">
                  Choose where to import from
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <ProviderCard
                    provider="google-drive"
                    onSelect={() => handleProviderSelect('google-drive')}
                  />
                  <ProviderCard
                    provider="microsoft-onedrive"
                    onSelect={() => handleProviderSelect('microsoft-onedrive')}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {screen.name === 'browser' && (() => {
          const browserProvider = screen.provider;
          return (
            <div className="flex flex-col" style={{ height: 'calc(80vh - 61px)' }}>
              <ImportBrowser
                provider={browserProvider}
                onSelectItem={(resolved) => {
                  onImportResolved(resolved);
                  onClose();
                }}
                onClose={onClose}
                onReconnectRequired={() =>
                  setScreen({ name: 'connection-required', provider: browserProvider })
                }
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
}
