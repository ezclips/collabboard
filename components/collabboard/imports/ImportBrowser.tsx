'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { ImportBrowserItem, ImportProvider } from '@/lib/imports/types';
import type { ResolvedImportItem } from '@/lib/imports/types';
import { resolveClientAccessToken } from '@/lib/imports/clientAuth';
import {
  ImportAuthError,
  listImportItems,
  resolveImportSelection,
  searchImportItems,
} from '@/lib/imports/clientApi';
import ImportSearchBar from './ImportSearchBar';
import ImportBreadcrumbs from './ImportBreadcrumbs';
import ImportGrid from './ImportGrid';

interface ImportBrowserProps {
  provider: ImportProvider;
  onSelectItem: (resolved: ResolvedImportItem) => void;
  onClose: () => void;
  onReconnectRequired?: () => void;
}

interface BreadcrumbEntry {
  id: string;
  name: string;
}

export default function ImportBrowser({
  provider,
  onSelectItem,
  onClose,
  onReconnectRequired,
}: ImportBrowserProps) {
  const [items, setItems] = useState<ImportBrowserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ImportBrowserItem | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([]);
  const [currentParentId, setCurrentParentId] = useState('root');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const reconnectHandlerRef = React.useRef(onReconnectRequired);

  useEffect(() => {
    reconnectHandlerRef.current = onReconnectRequired;
  }, [onReconnectRequired]);

  useEffect(() => {
    let isMounted = true;

    void resolveClientAccessToken().then((token) => {
      if (isMounted) {
        setAuthToken(token);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const loadFolder = useCallback(async (parentId: string) => {
    setLoading(true);
    setError(null);
    setSelectedItem(null);
    setIsSearchMode(false);

    try {
      const nextItems = await listImportItems(provider, parentId);
      setItems(nextItems);
    } catch (err) {
      if (err instanceof ImportAuthError) {
        if (reconnectHandlerRef.current) {
          reconnectHandlerRef.current();
        } else {
          setError('reconnect');
        }
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    if (!authToken) return;
    loadFolder('root');
  }, [authToken, loadFolder]);

  const handleSearch = async (query: string) => {
    setLoading(true);
    setError(null);
    setSelectedItem(null);
    setIsSearchMode(true);

    try {
      const nextItems = await searchImportItems(provider, query);
      setItems(nextItems);
    } catch (err) {
      if (err instanceof ImportAuthError) {
        if (reconnectHandlerRef.current) { reconnectHandlerRef.current(); } else { setError('reconnect'); }
        return;
      }
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClearSearch = () => {
    setIsSearchMode(false);
    loadFolder(currentParentId);
  };

  const handleNavigate = (item: ImportBrowserItem) => {
    if (!item.isFolder) return;
    const newParentId = item.id;
    setCurrentParentId(newParentId);
    setBreadcrumbs((prev) => [...prev, { id: item.id, name: item.name }]);
    loadFolder(newParentId);
  };

  const handleBreadcrumbNavigate = (id: string) => {
    if (id === 'root') {
      setBreadcrumbs([]);
      setCurrentParentId('root');
      loadFolder('root');
    } else {
      const idx = breadcrumbs.findIndex((b) => b.id === id);
      if (idx !== -1) {
        const newCrumbs = breadcrumbs.slice(0, idx + 1);
        setBreadcrumbs(newCrumbs);
        setCurrentParentId(id);
        loadFolder(id);
      }
    }
  };

  const handleSelect = async () => {
    if (!selectedItem) return;
    setResolving(true);

    try {
      const resolved: ResolvedImportItem = await resolveImportSelection({
        provider,
        itemId: selectedItem.id,
        name: selectedItem.name,
        mimeType: selectedItem.mimeType,
        thumbnailUrl: selectedItem.rawThumbnailUrl ?? selectedItem.thumbnailUrl,
        openUrl: selectedItem.openUrl,
        sizeBytes: selectedItem.sizeBytes,
      });
      onSelectItem(resolved);
    } catch (err) {
      if (err instanceof ImportAuthError) {
        if (reconnectHandlerRef.current) {
          reconnectHandlerRef.current();
        } else {
          setError('reconnect');
        }
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to resolve file');
    } finally {
      setResolving(false);
    }
  };

  const providerLabel = provider === 'google-drive' ? 'Google Drive' : 'Microsoft OneDrive';

  return (
    <div className="flex flex-col h-full">
      {/* Provider header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-gray-50">
        {provider === 'google-drive' ? (
          <svg className="w-5 h-5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
            <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 52H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
            <path d="M43.65 25L29.9 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 47.5A9 9 0 000 52h27.5z" fill="#00ac47"/>
            <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.65 9.2z" fill="#ea4335"/>
            <path d="M43.65 25L57.4 0H29.9z" fill="#00832d"/>
            <path d="M59.8 52h27.5L73.55 28c-.8-1.4-1.95-2.5-3.3-3.3L57.4 0 43.65 25z" fill="#2684fc"/>
            <path d="M27.5 52L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L59.8 52z" fill="#ffba00"/>
          </svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M10.5 18.5v-13l3 1.5v10z" fill="#0364B8"/>
            <path d="M14.5 7 20 10v7l-5.5-3.5z" fill="#0078D4"/>
            <path d="M4 10l6.5-3 3 1.5L7 12z" fill="#1490DF"/>
            <path d="M4 10v7l6.5 1.5V11.5z" fill="#28A8E8"/>
          </svg>
        )}
        <span className="text-sm font-semibold text-gray-700">{providerLabel}</span>
      </div>

      {/* Search bar */}
      <div className="px-4 py-3 border-b">
        <ImportSearchBar onSearch={handleSearch} onClear={handleClearSearch} isLoading={loading} />
      </div>

      {/* Breadcrumbs */}
      {!isSearchMode && breadcrumbs.length > 0 && (
        <div className="px-4 py-2 border-b bg-gray-50">
          <ImportBreadcrumbs crumbs={breadcrumbs} onNavigate={handleBreadcrumbNavigate} />
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : error === 'reconnect' ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500">
            <AlertCircle className="w-8 h-8 text-amber-400" />
            <p className="text-sm font-medium text-gray-700">Session expired — please reconnect {providerLabel}</p>
            <a
              href="/dashboard/settings/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Go to Settings → Integrations
            </a>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <p className="text-sm">{error}</p>
            <button
              onClick={() => loadFolder(currentParentId)}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          </div>
        ) : (
          <ImportGrid
            items={items}
            selectedId={selectedItem?.id || null}
            onSelect={setSelectedItem}
            onNavigate={handleNavigate}
            accessToken={authToken ?? ''}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
        <div className="text-xs text-gray-500">
          {selectedItem ? (
            <span className="truncate max-w-[200px] inline-block align-bottom font-medium text-gray-700">
              {selectedItem.name}
            </span>
          ) : (
            'Select a file to import'
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSelect}
            disabled={!selectedItem || resolving}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors flex items-center gap-1.5"
          >
            {resolving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {resolving ? 'Preparing...' : 'Select'}
          </button>
        </div>
      </div>
    </div>
  );
}
