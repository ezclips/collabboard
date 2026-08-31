'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AI_PROVIDER_TYPES, type AIProviderConnection, type AIProviderType } from '@/lib/domain/settings/aiProviderConnection';
import { AI_PROVIDER_LABELS, DISPLAY_NAME_LIMIT, MODEL_ID_LIMIT } from './aiSettingsClient';

/**
 * The one modal used by every provider action.
 *
 * The API key field is always `type="password"` and there is deliberately no
 * reveal control anywhere in this feature: a stored key cannot be read back
 * from the server, so showing one would only ever echo what the user just
 * typed while putting it on screen.
 */

export type AIProviderDialogMode = 'create' | 'edit' | 'replace-key' | 'test-model' | 'delete';

export interface AIProviderDialogSubmit {
  readonly providerType: AIProviderType;
  readonly displayName: string;
  readonly apiKey: string;
  readonly defaultModel: string | null;
  readonly model: string | null;
}

export interface AIProviderDialogProps {
  readonly mode: AIProviderDialogMode;
  /** Null for `create`; the target connection for every other mode. */
  readonly connection: AIProviderConnection | null;
  readonly busy: boolean;
  readonly onSubmit: (values: AIProviderDialogSubmit) => void;
  readonly onClose: () => void;
}

const TITLES: Record<AIProviderDialogMode, string> = {
  create: 'Add provider',
  edit: 'Edit provider',
  'replace-key': 'Replace API key',
  'test-model': 'Test connection',
  delete: 'Delete provider',
};

export default function AIProviderDialog({ mode, connection, busy, onSubmit, onClose }: AIProviderDialogProps) {
  const [providerType, setProviderType] = useState<AIProviderType>(connection?.providerType ?? 'openai');
  const [displayName, setDisplayName] = useState(connection?.displayName ?? AI_PROVIDER_LABELS.openai);
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState(connection?.defaultModel ?? '');
  const [model, setModel] = useState('');
  // A display name the user typed must survive re-renders; only an untouched
  // one follows the provider dropdown.
  const [nameTouched, setNameTouched] = useState(false);

  // The raw key never outlives the dialog.
  useEffect(() => () => setApiKey(''), []);

  const handleProviderChange = (next: AIProviderType) => {
    setProviderType(next);
    if (!nameTouched) setDisplayName(AI_PROVIDER_LABELS[next]);
  };

  const submit = () => {
    onSubmit({
      providerType,
      displayName: displayName.trim(),
      apiKey,
      defaultModel: defaultModel.trim() || null,
      model: model.trim() || null,
    });
    if (mode === 'create' || mode === 'replace-key') setApiKey('');
  };

  const canSubmit = (() => {
    if (busy) return false;
    if (mode === 'create') return displayName.trim().length > 0 && apiKey.trim().length >= 8;
    if (mode === 'replace-key') return apiKey.trim().length >= 8;
    if (mode === 'edit') return displayName.trim().length > 0;
    if (mode === 'test-model') return model.trim().length > 0;
    return true;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div role="dialog" aria-label={TITLES[mode]} className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900">{TITLES[mode]}</h3>

        {mode === 'delete' ? (
          <p className="mt-3 text-sm text-gray-600">
            Delete &ldquo;{connection?.displayName}&rdquo;? Any AI role currently using this provider will fall
            back to CollabBoard Default.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {mode === 'create' && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Provider</span>
                <select
                  aria-label="Provider"
                  value={providerType}
                  onChange={(event) => handleProviderChange(event.target.value as AIProviderType)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
                >
                  {AI_PROVIDER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {AI_PROVIDER_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {(mode === 'create' || mode === 'edit') && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Display name</span>
                <input
                  aria-label="Display name"
                  type="text"
                  maxLength={DISPLAY_NAME_LIMIT}
                  value={displayName}
                  onChange={(event) => {
                    setNameTouched(true);
                    setDisplayName(event.target.value);
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
                />
              </label>
            )}

            {(mode === 'create' || mode === 'replace-key') && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">
                  {mode === 'create' ? 'API key' : 'New API key'}
                </span>
                <input
                  aria-label={mode === 'create' ? 'API key' : 'New API key'}
                  type="password"
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  Stored encrypted. It cannot be viewed again after saving.
                </span>
              </label>
            )}

            {(mode === 'create' || mode === 'edit') && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Default model</span>
                <input
                  aria-label="Default model"
                  type="text"
                  maxLength={MODEL_ID_LIMIT}
                  value={defaultModel}
                  placeholder="Model ID"
                  onChange={(event) => setDefaultModel(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
                />
              </label>
            )}

            {mode === 'test-model' && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">Model ID for this test</span>
                <input
                  aria-label="Model ID for this test"
                  type="text"
                  maxLength={MODEL_ID_LIMIT}
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
                />
                <span className="mt-1 block text-xs text-gray-500">
                  Used for this test only. It is not saved to the provider.
                </span>
              </label>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              mode === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'delete' ? 'Delete provider' : mode === 'test-model' ? 'Run test' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
