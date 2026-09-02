'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { AI_ROLE_CHAT } from '@/lib/ai/aiRoles';
import {
  AI_PROVIDER_LABELS,
  COLLABBOARD_DEFAULT_MODEL,
  fetchAIProviders,
  fetchAIRoles,
  saveAIRole,
} from '@/components/settings/ai/aiSettingsClient';
import type { AIProviderConnection } from '@/lib/domain/settings/aiProviderConnection';

/**
 * Which provider runs Board Chat.
 *
 * Deliberately NOT a second provider system. It reads and writes the ONE
 * per-user role preference the Settings screen already owns, through the same
 * client functions, so choosing here and choosing there are the same act. The
 * chat route never learns of this: it resolves AI_ROLE_CHAT per request and
 * finds whatever the user last chose.
 *
 * That is also why the chat POST carries no provider, model or key. A chooser
 * that sent its selection with the message would be a second, weaker authority
 * over execution -- one a browser could set to anything.
 *
 * The list is the connection summaries the settings API already returns: a
 * display name, a provider type and a masked key hint. No key, ciphertext or
 * endpoint exists in that payload to expose.
 */

export interface BoardAiChatModelChooserProps {
  /** Disabled while a message is in flight, so a swap cannot race a request. */
  readonly disabled?: boolean;
  /** Surfaced by the drawer, which owns the one error line. */
  readonly onError?: (message: string | null) => void;
}

const DEFAULT_VALUE = '';

export default function BoardAiChatModelChooser({ disabled = false, onError }: BoardAiChatModelChooserProps) {
  const [connections, setConnections] = useState<readonly AIProviderConnection[]>([]);
  const [selected, setSelected] = useState<string>(DEFAULT_VALUE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Both reads are the settings API's own; neither returns a secret.
        const [providers, roles] = await Promise.all([fetchAIProviders(), fetchAIRoles()]);
        if (cancelled) return;
        setConnections(providers);
        setSelected(roles[AI_ROLE_CHAT]?.connectionId ?? DEFAULT_VALUE);
      } catch {
        // A chooser that cannot load leaves chat on whatever the server
        // resolves, which is the managed default -- not a reason to block the
        // conversation, so this is silent here and simply shows Default.
        if (!cancelled) setConnections([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const choose = useCallback(async (connectionId: string) => {
    const previous = selected;
    setSelected(connectionId);
    setSaving(true);
    onError?.(null);
    try {
      // The role's own model stays null: the connection's default model is the
      // resolver's fallback, and inventing a model id here would be a second
      // place that decides one.
      await saveAIRole(AI_ROLE_CHAT, connectionId === DEFAULT_VALUE ? null : connectionId, null);
    } catch {
      setSelected(previous);
      onError?.('Could not change the chat model.');
    } finally {
      setSaving(false);
    }
  }, [selected, onError]);

  const busy = loading || saving || disabled;

  return (
    <label className="flex min-w-0 items-center gap-1" data-board-ai-chat-chooser="true">
      <span className="sr-only">Board Chat model</span>
      <select
        aria-label="Board Chat model"
        data-board-ai-chat-model=""
        className="min-w-0 max-w-[150px] truncate rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-700 disabled:opacity-60"
        value={selected}
        disabled={busy}
        onChange={(event) => { void choose(event.target.value); }}
      >
        <option value={DEFAULT_VALUE}>{`CollabBoard Default (${COLLABBOARD_DEFAULT_MODEL})`}</option>
        {connections.map((connection) => (
          // Name, provider and the masked hint the API already publishes --
          // enough to tell two OpenAI keys apart, and nothing more.
          <option key={connection.id} value={connection.id}>
            {`${connection.displayName} — ${AI_PROVIDER_LABELS[connection.providerType]} ••${connection.keyHint}`}
          </option>
        ))}
      </select>
      {saving ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-gray-400" aria-hidden="true" /> : null}
    </label>
  );
}
