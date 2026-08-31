'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AIProviderConnection } from '@/lib/domain/settings/aiProviderConnection';
import {
  AI_PROVIDER_LABELS,
  AI_ROLES,
  AI_ROLE_DESCRIPTIONS,
  AI_ROLE_LABELS,
  COLLABBOARD_DEFAULT_MODEL,
  MODEL_ID_LIMIT,
  type AIRoleAssignments,
  type AISettingsRole,
} from './aiSettingsClient';

/**
 * Section 1 -- which model each AI feature uses.
 *
 * "CollabBoard Default" is the first option in every dropdown and is NOT a
 * provider row: it is the absence of a connection, saved as connectionId null.
 * A role on the default has no model override, so the model field is read-only.
 */

export interface AIRoleSettingsProps {
  readonly providers: readonly AIProviderConnection[];
  readonly roles: AIRoleAssignments;
  readonly onSave: (role: AISettingsRole, connectionId: string | null, modelId: string | null) => Promise<void>;
}

/** Per-row draft. Absent means "showing the persisted value". */
type RoleDrafts = Partial<Record<string, { connectionId: string | null; modelId: string }>>;

export default function AIRoleSettings({ providers, roles, onSave }: AIRoleSettingsProps) {
  const [drafts, setDrafts] = useState<RoleDrafts>({});
  const [savingRole, setSavingRole] = useState<string | null>(null);

  const draftFor = (role: AISettingsRole) => {
    const draft = drafts[role];
    if (draft) return draft;
    const stored = roles[role];
    return { connectionId: stored?.connectionId ?? null, modelId: stored?.modelId ?? '' };
  };

  const setDraft = (role: AISettingsRole, next: { connectionId: string | null; modelId: string }) => {
    setDrafts((current) => ({ ...current, [role]: next }));
  };

  const handleSave = async (role: AISettingsRole) => {
    const draft = draftFor(role);
    setSavingRole(role);
    try {
      // CollabBoard Default never persists a model: the server owns which model
      // the managed provider uses.
      const modelId = draft.connectionId === null ? null : draft.modelId.trim() || null;
      await onSave(role, draft.connectionId, modelId);
      setDrafts((current) => {
        const next = { ...current };
        delete next[role];
        return next;
      });
    } finally {
      setSavingRole(null);
    }
  };

  return (
    <section data-testid="ai-role-settings">
      <h2 className="text-lg font-semibold text-gray-900">AI models</h2>
      <p className="mt-1 text-sm text-gray-500">
        Choose which model CollabBoard uses for each AI feature.
      </p>

      <div className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {AI_ROLES.map((role) => {
          const draft = draftFor(role);
          const connection = providers.find((provider) => provider.id === draft.connectionId) ?? null;
          const isDefault = draft.connectionId === null;
          // The one state that must block Save: a BYOK provider with neither a
          // role override nor a provider default has no model to run.
          const missingModel = !isDefault && draft.modelId.trim().length === 0 && !connection?.defaultModel;
          const saving = savingRole === role;

          return (
            <div key={role} className="px-6 py-5" data-testid={`ai-role-row-${role}`}>
              <div className="font-medium text-gray-900">{AI_ROLE_LABELS[role]}</div>
              <div className="mt-1 max-w-lg text-sm text-gray-500">{AI_ROLE_DESCRIPTIONS[role]}</div>

              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
                <label className="flex-1">
                  <span className="mb-1 block text-xs font-medium text-gray-700">Provider</span>
                  <select
                    aria-label={`Provider for ${AI_ROLE_LABELS[role]}`}
                    value={draft.connectionId ?? ''}
                    disabled={saving}
                    onChange={(event) =>
                      setDraft(role, { connectionId: event.target.value || null, modelId: draft.modelId })
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400"
                  >
                    <option value="">CollabBoard Default — Managed by CollabBoard (DeepSeek)</option>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.displayName} — {AI_PROVIDER_LABELS[provider.providerType]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex-1">
                  <span className="mb-1 block text-xs font-medium text-gray-700">Model</span>
                  <input
                    aria-label={`Model for ${AI_ROLE_LABELS[role]}`}
                    type="text"
                    maxLength={MODEL_ID_LIMIT}
                    disabled={isDefault || saving}
                    value={isDefault ? COLLABBOARD_DEFAULT_MODEL : draft.modelId}
                    placeholder={isDefault ? undefined : 'Leave blank to use the provider default.'}
                    onChange={(event) =>
                      setDraft(role, { connectionId: draft.connectionId, modelId: event.target.value })
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                  {isDefault ? (
                    <span className="mt-1 block text-xs text-gray-500">Managed automatically by CollabBoard.</span>
                  ) : connection?.defaultModel ? (
                    <span className="mt-1 block text-xs text-gray-500">
                      Uses default: {connection.defaultModel}
                    </span>
                  ) : null}
                  {missingModel && (
                    <span role="alert" className="mt-1 block text-xs text-red-600">
                      A model is required for this provider.
                    </span>
                  )}
                </label>

                <div className="sm:pt-6">
                  <button
                    type="button"
                    disabled={saving || missingModel}
                    onClick={() => void handleSave(role)}
                    className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save
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
