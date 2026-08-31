'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AIProviderConnection } from '@/lib/domain/settings/aiProviderConnection';
import AIRoleSettings from '@/components/settings/ai/AIRoleSettings';
import AIProviderList, { type AIProviderTestStatus } from '@/components/settings/ai/AIProviderList';
import AIProviderDialog, {
  type AIProviderDialogMode,
  type AIProviderDialogSubmit,
} from '@/components/settings/ai/AIProviderDialog';
import {
  AISettingsRequestError,
  createAIProvider,
  deleteAIProvider,
  fetchAIProviders,
  fetchAIRoles,
  replaceAIProviderKey,
  saveAIRole,
  testAIProvider,
  updateAIProvider,
  type AIRoleAssignments,
  type AISettingsRole,
} from '@/components/settings/ai/aiSettingsClient';

/**
 * Settings -> AI.
 *
 * Owns the fetched state; the two sections render it. Nothing here holds a
 * credential: a raw key exists only inside the dialog's own state while it is
 * being typed, and is handed straight to the API.
 */

interface DialogState {
  readonly mode: AIProviderDialogMode;
  readonly connection: AIProviderConnection | null;
}

export default function AISettingsPage() {
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [providers, setProviders] = useState<readonly AIProviderConnection[]>([]);
  const [roles, setRoles] = useState<AIRoleAssignments>({});
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busyProviderId, setBusyProviderId] = useState<string | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, AIProviderTestStatus>>({});

  /** A 401 is CollabBoard's own session; anything else is a feature error. */
  const reportError = useCallback((error: unknown, fallback: string) => {
    if (error instanceof AISettingsRequestError) {
      toast.error(error.sessionExpired ? 'Your session expired. Please sign in again.' : error.message);
      return;
    }
    toast.error(fallback);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedProviders, loadedRoles] = await Promise.all([fetchAIProviders(), fetchAIRoles()]);
      setProviders(loadedProviders);
      setRoles(loadedRoles);
      setLoadFailed(false);
    } catch (error) {
      // Nothing is fabricated on failure: an empty page with an error beats a
      // page that looks configured when the fetch never succeeded.
      setLoadFailed(true);
      reportError(error, 'Could not load AI settings.');
    } finally {
      setLoading(false);
    }
  }, [reportError]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveRole = async (
    role: AISettingsRole,
    connectionId: string | null,
    modelId: string | null,
  ) => {
    try {
      await saveAIRole(role, connectionId, modelId);
      setRoles((current) => ({ ...current, [role]: { connectionId, modelId } }));
      toast.success('AI model updated');
    } catch (error) {
      // The draft is intentionally left intact so the user can retry.
      reportError(error, 'Could not save the AI model.');
      throw error;
    }
  };

  const runTest = async (connection: AIProviderConnection, model: string | null) => {
    setTestStatus((current) => ({ ...current, [connection.id]: 'testing' }));
    setBusyProviderId(connection.id);
    try {
      const verifiedAt = await testAIProvider(connection.id, model);
      setTestStatus((current) => ({ ...current, [connection.id]: 'success' }));
      setProviders((current) =>
        current.map((item) => (item.id === connection.id ? { ...item, verifiedAt } : item)),
      );
      toast.success('Connection verified');
    } catch (error) {
      // Historical verifiedAt is deliberately left untouched here.
      setTestStatus((current) => ({ ...current, [connection.id]: 'failed' }));
      reportError(error, 'The connection test failed.');
    } finally {
      setBusyProviderId(null);
    }
  };

  const handleTest = (connection: AIProviderConnection) => {
    if (!connection.defaultModel) {
      setDialog({ mode: 'test-model', connection });
      return;
    }
    void runTest(connection, null);
  };

  const handleDialogSubmit = async (values: AIProviderDialogSubmit) => {
    if (!dialog) return;
    const { mode, connection } = dialog;

    if (mode === 'test-model' && connection) {
      setDialog(null);
      await runTest(connection, values.model);
      return;
    }

    setDialogBusy(true);
    try {
      if (mode === 'create') {
        await createAIProvider({
          providerType: values.providerType,
          displayName: values.displayName,
          apiKey: values.apiKey,
          defaultModel: values.defaultModel,
        });
        toast.success('Provider added');
      } else if (mode === 'edit' && connection) {
        await updateAIProvider(connection.id, {
          displayName: values.displayName,
          defaultModel: values.defaultModel,
        });
        toast.success('Provider updated');
      } else if (mode === 'replace-key' && connection) {
        await replaceAIProviderKey(connection.id, values.apiKey);
        setTestStatus((current) => ({ ...current, [connection.id]: 'idle' }));
        toast.success('API key replaced');
      } else if (mode === 'delete' && connection) {
        await deleteAIProvider(connection.id);
        toast.success('Provider deleted');
      }

      setDialog(null);
      // Roles are reloaded too: the database resets any role that pointed at a
      // deleted provider, and the page must show that fallback immediately.
      await load();
    } catch (error) {
      reportError(error, 'The request failed.');
    } finally {
      setDialogBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">AI</h1>
      </div>

      {loadFailed && (
        <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          Could not load your AI settings.{' '}
          <button type="button" onClick={() => void load()} className="font-medium underline">
            Try again
          </button>
        </div>
      )}

      <AIRoleSettings providers={providers} roles={roles} onSave={handleSaveRole} />

      <AIProviderList
        providers={providers}
        testStatus={testStatus}
        busyProviderId={busyProviderId}
        onAdd={() => setDialog({ mode: 'create', connection: null })}
        onTest={handleTest}
        onEdit={(connection) => setDialog({ mode: 'edit', connection })}
        onReplaceKey={(connection) => setDialog({ mode: 'replace-key', connection })}
        onDelete={(connection) => setDialog({ mode: 'delete', connection })}
      />

      {dialog && (
        <AIProviderDialog
          mode={dialog.mode}
          connection={dialog.connection}
          busy={dialogBusy}
          onSubmit={(values) => void handleDialogSubmit(values)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
