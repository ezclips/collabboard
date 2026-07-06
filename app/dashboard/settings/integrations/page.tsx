'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'sonner';

const findAccessTokenDeep = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.access_token === 'string' && obj.access_token.length > 10) {
      return obj.access_token;
    }
    for (const nested of Object.values(obj)) {
      const found = findAccessTokenDeep(nested);
      if (found) return found;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAccessTokenDeep(item);
      if (found) return found;
    }
  }
  return null;
};

const getAccessTokenFromStorage = (): string | null => {
  try {
    const lsKeys = Object.keys(localStorage).sort((a, b) => (a > b ? -1 : 1));
    for (const key of lsKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let token: string | null = null;
      try {
        const parsed = JSON.parse(raw);
        token = findAccessTokenDeep(parsed);
      } catch {
        // ignore non-JSON values
      }
      if (token) return token;
    }
  } catch { /* ignore */ }
  return null;
};

interface Integration {
  id: 'google-drive' | 'microsoft-onedrive';
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  connectedEmail?: string;
}

const GoogleDriveIcon = () => (
  <svg viewBox="0 0 87.3 78" className="h-8 w-8">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.9 13.8z" fill="#ea4335" />
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
  </svg>
);

const OneDriveIcon = () => (
  <svg viewBox="0 0 24 24" className="h-8 w-8">
    <path d="M19.456 10.089a5.5 5.5 0 0 0-10.2-1.847A4 4 0 0 0 5 12.25a4 4 0 0 0 4 4h10a3 3 0 0 0 .456-5.961z" fill="#0078D4" />
    <path d="M9.256 8.242a5.5 5.5 0 0 1 10.2 1.847A3 3 0 0 1 19 16.25H9a4 4 0 0 1-4-4 4 4 0 0 1 4.256-3.908z" fill="#28A8EA" />
  </svg>
);

const BASE_INTEGRATIONS: Integration[] = [
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Import files from your Google Drive account and link docs, sheets, slides, and forms.',
    icon: <GoogleDriveIcon />,
    connected: false,
  },
  {
    id: 'microsoft-onedrive',
    name: 'Microsoft OneDrive',
    description: 'Connect your Microsoft OneDrive account to import files and share links.',
    icon: <OneDriveIcon />,
    connected: false,
  },
];

function IntegrationsContent() {
  const supabase = createClientComponentClient();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>(BASE_INTEGRATIONS);

  useEffect(() => {
    void loadIntegrations();
  }, []);

  useEffect(() => {
    const status = searchParams.get('status');
    const provider = searchParams.get('provider');
    const message = searchParams.get('message');

    if (!status || !provider) return;
    if (status === 'success') {
      toast.success(`${provider} connected`);
    } else {
      toast.error(message || `Failed to connect ${provider}`);
    }
  }, [searchParams]);

  const resolveAccessToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;

    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session?.access_token) return refreshed.session.access_token;

    return getAccessTokenFromStorage();
  };

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      const token = await resolveAccessToken();
      if (!token) {
        throw new Error('Not authenticated. Please sign in again.');
      }
      const res = await fetch('/api/settings/integrations', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load integrations');
      }

      const byProvider = new Map<string, { connected: boolean; email: string | null }>();
      for (const item of json.integrations || []) {
        byProvider.set(item.provider, { connected: !!item.connected, email: item.email || null });
      }

      setIntegrations(
        BASE_INTEGRATIONS.map((integration) => {
          const state = byProvider.get(integration.id);
          return {
            ...integration,
            connected: state?.connected || false,
            connectedEmail: state?.email || undefined,
          };
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load integrations';
      console.error('Error loading integrations:', { err, message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (integrationId: Integration['id']) => {
    try {
      setConnecting(integrationId);
      const token = await resolveAccessToken();
      if (!token) {
        throw new Error('Not authenticated. Please sign in again.');
      }
      const res = await fetch('/api/settings/integrations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: integrationId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to start OAuth flow');
      }
      if (!json?.url) {
        throw new Error('OAuth URL was not returned by server');
      }
      window.location.href = json.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect integration';
      toast.error(message);
      setConnecting(null);
    }
  };

  const handleDisconnect = async (integrationId: Integration['id']) => {
    try {
      setConnecting(integrationId);
      const token = await resolveAccessToken();
      if (!token) {
        throw new Error('Not authenticated. Please sign in again.');
      }
      const res = await fetch('/api/settings/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provider: integrationId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to disconnect integration');
      }

      setIntegrations((prev) =>
        prev.map((integration) =>
          integration.id === integrationId
            ? { ...integration, connected: false, connectedEmail: undefined }
            : integration
        )
      );
      toast.success('Integration disconnected');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect integration';
      toast.error(message);
    } finally {
      setConnecting(null);
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
        <h1 className="text-2xl font-semibold text-gray-900">Integrations</h1>
      </div>

      <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {integrations.map((integration) => (
          <div key={integration.id} className="flex items-center justify-between px-6 py-5">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">{integration.icon}</div>
              <div>
                <div className="font-medium text-gray-900">{integration.name}</div>
                <div className="mt-1 max-w-lg text-sm text-gray-500">{integration.description}</div>
                {integration.connected && integration.connectedEmail && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                    <Check className="h-4 w-4" />
                    Connected as {integration.connectedEmail}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() =>
                integration.connected ? handleDisconnect(integration.id) : handleConnect(integration.id)
              }
              disabled={connecting === integration.id}
              className={`flex items-center gap-2 rounded-full px-6 py-2 font-medium transition-colors ${
                integration.connected
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-pink-500 text-white hover:bg-pink-600'
              }`}
            >
              {connecting === integration.id && <Loader2 className="h-4 w-4 animate-spin" />}
              {integration.connected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  // useSearchParams requires a Suspense boundary for prerendering (Next 15)
  return (
    <Suspense fallback={null}>
      <IntegrationsContent />
    </Suspense>
  );
}
