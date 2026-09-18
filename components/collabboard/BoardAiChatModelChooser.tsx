'use client';

import React from 'react';

import { AI_ROLE_CHAT } from '@/lib/ai/aiRoles';
import AIRoleModelChooser from '@/components/ai/AIRoleModelChooser';

/**
 * Which provider runs Board Chat.
 *
 * A THIN WRAPPER over AIRoleModelChooser, which holds the behaviour. This file
 * supplies only what is specific to chat: the role, the data-attribute
 * namespace the chat tests address, and the wording of its one error.
 *
 * Deliberately NOT a second provider system. The generic component reads and
 * writes the ONE per-user role preference the Settings screen already owns,
 * through the same client functions, so choosing here and choosing there are
 * the same act. The chat route never learns of this: it resolves AI_ROLE_CHAT
 * per request and finds whatever the user last chose.
 *
 * That is also why the chat POST carries no provider, model or key. A chooser
 * that sent its selection with the message would be a second, weaker authority
 * over execution -- one a browser could set to anything.
 *
 * ------------------------------------------------------------------
 * THE TWO RULES THIS FILE EXISTS TO KEEP TRUE, restated here because they were
 * each learned from a defect on THIS surface and a wrapper is exactly where
 * they get quietly dropped:
 *
 *   * IT MUST NEVER NAME A PROVIDER IT HAS NOT READ. Until both fetches resolve
 *     it knows nothing, so it shows an indeterminate label rather than the
 *     first option's -- a cold route took 8.4 seconds on 2026-09-18 and a
 *     reading taken during it reported the managed default while the stored
 *     role was a BYOK connection. A definite wrong value is worse than none.
 *   * A FAILED LOAD DOES NOT LEAVE CHAT ON A KNOWN MODEL. The route resolves
 *     AI_ROLE_CHAT per request and finds the STORED preference, whatever this
 *     component failed to read. So it may not claim a provider, and it must not
 *     offer to change one -- its value never changed, so picking the option it
 *     is already showing fires no change event and would persist nothing.
 *     Disabled, with a pointer to Settings, is the honest control.
 * ------------------------------------------------------------------
 */

export interface BoardAiChatModelChooserProps {
  /** Disabled while a message is in flight, so a swap cannot race a request. */
  readonly disabled?: boolean;
  /** Surfaced by the drawer, which owns the one error line. */
  readonly onError?: (message: string | null) => void;
}

export default function BoardAiChatModelChooser({ disabled = false, onError }: BoardAiChatModelChooserProps) {
  return (
    <AIRoleModelChooser
      role={AI_ROLE_CHAT}
      label="Board Chat model"
      attributePrefix="board-ai-chat"
      saveErrorMessage="Could not change the chat model."
      disabled={disabled}
      onError={onError}
    />
  );
}
