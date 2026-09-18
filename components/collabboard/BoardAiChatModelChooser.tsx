'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { AI_ROLE_CHAT } from '@/lib/ai/aiRoles';
import {
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
 * The list is the connection summaries the settings API already returns, and
 * this component renders the display name alone. The payload does carry a
 * provider type and a masked key hint; neither is rendered here. No key,
 * ciphertext or endpoint exists in that payload to expose.
 *
 * It must never NAME a provider it has not read. Until both fetches resolve it
 * knows nothing, so it shows an indeterminate label rather than the first
 * option's -- a cold route took 8.4 seconds on 2026-09-18 and a reading taken
 * during it reported the managed default while the stored role was a BYOK
 * connection. A definite wrong value is worse than no value.
 */

export interface BoardAiChatModelChooserProps {
  /** Disabled while a message is in flight, so a swap cannot race a request. */
  readonly disabled?: boolean;
  /** Surfaced by the drawer, which owns the one error line. */
  readonly onError?: (message: string | null) => void;
}

const DEFAULT_VALUE = '';

/** Three states, because "could not load" is not "loaded, and there is nothing". */
type ChooserStatus = 'loading' | 'ready' | 'unavailable';

const UNAVAILABLE_TITLE = 'Could not load your AI connections. Open Settings → AI to check them.';

export default function BoardAiChatModelChooser({ disabled = false, onError }: BoardAiChatModelChooserProps) {
  const [connections, setConnections] = useState<readonly AIProviderConnection[]>([]);
  const [selected, setSelected] = useState<string>(DEFAULT_VALUE);
  const [status, setStatus] = useState<ChooserStatus>('loading');
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
        setStatus('ready');
      } catch {
        // A chooser that cannot load does NOT leave chat on the managed
        // default: the route resolves AI_ROLE_CHAT per request and finds the
        // STORED preference, whatever this component failed to read. So it
        // cannot claim a provider, and it must not offer to change one --
        // its value never changed, so picking the option it is already showing
        // fires no change event and would persist nothing.
        if (!cancelled) { setConnections([]); setStatus('unavailable'); }
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

  const busy = status !== 'ready' || saving || disabled;

  return (
    <label className="flex min-w-0 items-center gap-1" data-board-ai-chat-chooser="true">
      <span className="sr-only">Board Chat model</span>
      <select
        aria-label="Board Chat model"
        data-board-ai-chat-model=""
        data-board-ai-chat-model-status={status}
        title={status === 'unavailable' ? UNAVAILABLE_TITLE : undefined}
        className="min-w-0 max-w-[150px] truncate rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-700 disabled:opacity-60"
        value={selected}
        disabled={busy}
        onChange={(event) => { void choose(event.target.value); }}
      >
        {status === 'ready' ? (
          <>
            <option value={DEFAULT_VALUE}>CollabBoard Default</option>
            {connections.map((connection) => (
              // The display name alone. It is what tells two connections apart;
              // a masked key suffix told the user which KEY, which is not the
              // question, and it put credential-adjacent material in the chat
              // UI for no reason.
              <option key={connection.id} value={connection.id}>
                {connection.displayName}
              </option>
            ))}
          </>
        ) : (
          // One option, carrying the CURRENT value so the control is still
          // controlled, and saying only what is actually known.
          <option value={selected}>
            {status === 'loading' ? 'Loading…' : 'Model unavailable'}
          </option>
        )}
      </select>
      {saving ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-gray-400" aria-hidden="true" /> : null}
    </label>
  );
}
