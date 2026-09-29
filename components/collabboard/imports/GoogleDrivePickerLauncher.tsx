'use client';

// PATCH-214. Google's own Picker, in place of our folder browser.
//
// We used to ask for `drive.readonly` (read the WHOLE Drive), a Google
// "restricted" scope that caps the app at 100 test users behind an unverified-app
// warning until it passes a paid yearly security assessment. The Picker plus
// `drive.file` is the non-sensitive alternative: the user picks files and the app
// can read only those. As a bonus it brings Google's own search, Recent, Starred,
// Shared with me and Shared drives.
//
// The Picker is Google's OWN script (`lib/imports/googlePickerClient.ts`), not the
// npm wrapper: the wrapper is ESM-only, Next's client compile could not resolve
// it, and it broke the whole board page. The script is loaded directly instead.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import type { ResolvedImportItem } from '@/lib/imports/types';
import {
  ImportAuthError,
  getGooglePickerToken,
  resolveImportSelection,
} from '@/lib/imports/clientApi';
import { loadGooglePicker, openGooglePicker } from '@/lib/imports/googlePickerClient';

// Read at render, not at module scope, so the key can be set per environment
// (and per test) without a rebuild.
const pickerApiKey = (): string | undefined => process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;

export interface GoogleDrivePickerLauncherProps {
  onSelectItem: (resolved: ResolvedImportItem) => void;
  onClose: () => void;
  onReconnectRequired?: () => void;
  /**
   * PATCH-214. Fired when Google's own picker modal appears (true) or goes away
   * (false). The host uses it to hide OUR dialog chrome while Google's modal is
   * up -- ours is `z-[4200]` and would otherwise sit on top of it.
   */
  onPickerOpenChange?: (open: boolean) => void;
  /**
   * May this host still publish what a selection resolves to, RIGHT NOW?
   * Read at the moment of use and again on the way back, exactly as
   * `ImportBrowser` does -- resolving makes the server do real work on the way
   * to publishing here, so that step asks first.
   */
  canResolveSelection?: () => boolean;
}

type Status =
  | { name: 'loading' }
  | { name: 'ready'; accessToken: string; appId: string }
  | { name: 'resolving' }
  | { name: 'error'; message: string }
  | { name: 'unconfigured' };

export default function GoogleDrivePickerLauncher({
  onSelectItem,
  onClose,
  onReconnectRequired,
  onPickerOpenChange,
  canResolveSelection,
}: GoogleDrivePickerLauncherProps) {
  const apiKey = pickerApiKey();
  const [status, setStatus] = useState<Status>(() =>
    apiKey ? { name: 'loading' } : { name: 'unconfigured' }
  );
  // PATCH-214 FIX. "Try again" set status back to 'loading', but the token
  // fetch effect had `[]` deps, so nothing ever refetched and it spun forever.
  // This counter is bumped by Try again and is a dep of that effect.
  const [attempt, setAttempt] = useState(0);
  const resolveAbortRef = useRef<AbortController | null>(null);
  const canResolveRef = useRef(canResolveSelection);
  const reconnectRef = useRef(onReconnectRequired);
  const pickerOpenChangeRef = useRef(onPickerOpenChange);
  // PATCH-214 FIX. These two are read through refs so `handlePicked` /
  // `handleCanceled` can be STABLE. `ImportsDialog` rebuilds its callbacks on
  // every render, and the open-picker effect must not depend on them: otherwise
  // any parent re-render (setPickerOpen(true), a realtime board update) closed
  // and reopened Google's picker, losing the user's place in it.
  const onSelectItemRef = useRef(onSelectItem);
  const onCloseRef = useRef(onClose);
  // The live Picker, so a status change or unmount can close it.
  const pickerRef = useRef<{ close(): void } | null>(null);

  useEffect(() => {
    canResolveRef.current = canResolveSelection;
  }, [canResolveSelection]);
  useEffect(() => {
    reconnectRef.current = onReconnectRequired;
  }, [onReconnectRequired]);
  useEffect(() => {
    pickerOpenChangeRef.current = onPickerOpenChange;
  }, [onPickerOpenChange]);
  useEffect(() => {
    onSelectItemRef.current = onSelectItem;
  }, [onSelectItem]);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Tell the host when Google's modal is on screen, so it can hide its own.
  useEffect(() => {
    pickerOpenChangeRef.current?.(status.name === 'ready');
  }, [status.name]);

  useEffect(() => () => {
    resolveAbortRef.current?.abort();
    resolveAbortRef.current = null;
  }, []);

  // Fetch the picker token. A 401 means the Google connection is gone. Re-runs
  // whenever `attempt` changes, which is what "Try again" does.
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const { accessToken, appId } = await getGooglePickerToken();
        if (!cancelled) setStatus({ name: 'ready', accessToken, appId });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ImportAuthError) {
          if (reconnectRef.current) reconnectRef.current();
          else setStatus({ name: 'error', message: 'Your Google Drive connection expired. Please reconnect.' });
          return;
        }
        setStatus({ name: 'error', message: 'Could not open Google Drive. Please try again.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey, attempt]);

  const handlePicked = useCallback(async (doc: { id: string; name: string; mimeType: string }) => {
    if (!doc?.id) return;
    // Checked IMMEDIATELY before the request, not when this callback was made.
    if (canResolveRef.current && !canResolveRef.current()) return;

    resolveAbortRef.current?.abort();
    const controller = new AbortController();
    resolveAbortRef.current = controller;
    setStatus({ name: 'resolving' });

    try {
      const resolved = await resolveImportSelection(
        {
          provider: 'google-drive',
          itemId: doc.id,
          name: doc.name || 'Untitled',
          mimeType: doc.mimeType || 'application/octet-stream',
        },
        controller.signal
      );
      if (controller.signal.aborted) return;
      // Asked again on the way back: the answer arrives later than the request.
      if (canResolveRef.current && !canResolveRef.current()) return;
      onSelectItemRef.current(resolved);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ImportAuthError) {
        if (reconnectRef.current) reconnectRef.current();
        else setStatus({ name: 'error', message: 'Your Google Drive connection expired. Please reconnect.' });
        return;
      }
      setStatus({ name: 'error', message: 'Could not add that file to the board.' });
    } finally {
      if (resolveAbortRef.current === controller) resolveAbortRef.current = null;
    }
  }, []);

  const handleCanceled = useCallback(() => {
    onCloseRef.current();
  }, []);

  /**
   * PATCH-214. Once the token is in hand, load Google's script and open the
   * Picker. Closes it when the status moves on or the launcher unmounts.
   */
  useEffect(() => {
    if (status.name !== 'ready') return;
    let disposed = false;

    void (async () => {
      try {
        await loadGooglePicker();
        if (disposed) return;
        const picker = openGooglePicker({
          accessToken: status.accessToken,
          apiKey: apiKey!,
          appId: status.appId,
          onPicked: (doc) => { void handlePicked(doc); },
          onCanceled: handleCanceled,
        });
        if (disposed) {
          picker.close();
          return;
        }
        pickerRef.current = picker;
      } catch {
        if (!disposed) {
          setStatus({ name: 'error', message: 'Could not open Google Drive. Please try again.' });
        }
      }
    })();

    return () => {
      disposed = true;
      pickerRef.current?.close();
      pickerRef.current = null;
    };
  }, [status, apiKey]);

  if (status.name === 'unconfigured') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircle className="h-8 w-8 text-amber-400" />
        <p className="text-sm text-gray-600">
          Google Drive import is not set up yet (the Picker API key is missing).
        </p>
        <button
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          Close
        </button>
      </div>
    );
  }

  if (status.name === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Opening Google Drive…</p>
      </div>
    );
  }

  if (status.name === 'resolving') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Adding to the board…</p>
      </div>
    );
  }

  if (status.name === 'error') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-gray-600">{status.message}</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setStatus({ name: 'loading' });
              setAttempt((n) => n + 1);
            }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Try again
          </button>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // status.name === 'ready': Google's picker IS the visible surface (its own
  // modal, attached to document.body). Nothing of ours is drawn; the dialog has
  // hidden its chrome.
  return null;
}
