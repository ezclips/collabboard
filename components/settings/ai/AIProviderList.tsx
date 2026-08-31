'use client';

import React from 'react';
import { AlertCircle, Check, Loader2, Plus } from 'lucide-react';
import type { AIProviderConnection } from '@/lib/domain/settings/aiProviderConnection';
import { AI_PROVIDER_LABELS, COLLABBOARD_DEFAULT_MODEL, formatVerifiedAt } from './aiSettingsClient';

/**
 * Section 2 -- the CollabBoard Default pseudo-card plus the user's own
 * connections.
 *
 * Verification is shown as TWO separate things, deliberately:
 *
 *   `verifiedAt` is history -- "Last verified <date>". It records that a test
 *   once passed, which is not a claim the key still works today, so it is never
 *   rendered as a bare "Verified" badge.
 *
 *   `testStatus` is this page session only -- what the test the user just ran
 *   did. A failure shows "Test failed" beside the unchanged history rather than
 *   erasing it.
 */

export type AIProviderTestStatus = 'idle' | 'testing' | 'success' | 'failed';

export interface AIProviderListProps {
  readonly providers: readonly AIProviderConnection[];
  readonly testStatus: Readonly<Record<string, AIProviderTestStatus>>;
  readonly busyProviderId: string | null;
  readonly onAdd: () => void;
  readonly onTest: (connection: AIProviderConnection) => void;
  readonly onEdit: (connection: AIProviderConnection) => void;
  readonly onReplaceKey: (connection: AIProviderConnection) => void;
  readonly onDelete: (connection: AIProviderConnection) => void;
}

function TestStatusLabel({ status }: { status: AIProviderTestStatus }) {
  if (status === 'testing') {
    return (
      <span className="flex items-center gap-1 text-xs text-gray-500">
        <Loader2 className="h-3 w-3 animate-spin" /> Testing…
      </span>
    );
  }
  if (status === 'success') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <Check className="h-3 w-3" /> Connection verified
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600">
        <AlertCircle className="h-3 w-3" /> Test failed
      </span>
    );
  }
  return null;
}

export default function AIProviderList({
  providers,
  testStatus,
  busyProviderId,
  onAdd,
  onTest,
  onEdit,
  onReplaceKey,
  onDelete,
}: AIProviderListProps) {
  return (
    <section className="mt-10" data-testid="ai-provider-list">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">AI providers</h2>
          <p className="mt-1 text-sm text-gray-500">
            Use CollabBoard&rsquo;s default AI, or connect your own provider API key.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          <Plus className="h-4 w-4" />
          Add provider
        </button>
      </div>

      <div className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {/* Not a database row: the absence of a role preference resolves here. */}
        <div className="px-6 py-5" data-testid="ai-provider-default-card">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">CollabBoard Default</span>
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              Available
            </span>
          </div>
          <div className="mt-1 max-w-lg text-sm text-gray-500">
            Uses CollabBoard-managed AI. No API key required.
          </div>
          <div className="mt-2 text-xs text-gray-500">DeepSeek · {COLLABBOARD_DEFAULT_MODEL}</div>
        </div>

        {providers.map((provider) => {
          const status = testStatus[provider.id] ?? 'idle';
          const lastVerified = formatVerifiedAt(provider.verifiedAt);
          const busy = busyProviderId === provider.id;

          return (
            <div key={provider.id} className="px-6 py-5" data-testid={`ai-provider-card-${provider.id}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{provider.displayName}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {AI_PROVIDER_LABELS[provider.providerType]}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-sm text-gray-500">••••{provider.keyHint}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {provider.defaultModel ? provider.defaultModel : 'No default model'}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {lastVerified && (
                      <span className="text-xs text-gray-500">Last verified {lastVerified}</span>
                    )}
                    <TestStatusLabel status={status} />
                  </div>
                </div>

                <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onTest(provider)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Test connection
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onEdit(provider)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onReplaceKey(provider)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Replace key
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(provider)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
