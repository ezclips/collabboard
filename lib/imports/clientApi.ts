'use client';

import type {
  ImportBrowserItem,
  ImportProvider,
  ImportProviderStatus,
  ResolvedImportItem,
} from './types';
import { resolveClientAccessToken } from './clientAuth';

type ImportItemsResponse = {
  items?: ImportBrowserItem[];
};

type ResolveImportSelectionInput = {
  provider: ImportProvider;
  itemId: string;
  name: string;
  mimeType: string;
  thumbnailUrl?: string;
  openUrl?: string;
  sizeBytes?: number;
};

export class ImportAuthError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'ImportAuthError';
  }
}

async function buildAuthHeaders(extraHeaders?: HeadersInit): Promise<HeadersInit> {
  const token = await resolveClientAccessToken();
  return token
    ? { ...extraHeaders, Authorization: `Bearer ${token}` }
    : (extraHeaders ?? {});
}

async function fetchImportJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = await buildAuthHeaders(init?.headers);
  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    throw new ImportAuthError();
  }

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export async function getImportProviderStatus(provider: ImportProvider): Promise<ImportProviderStatus> {
  return fetchImportJson<ImportProviderStatus>(
    `/api/imports/status?provider=${encodeURIComponent(provider)}`
  );
}

export async function listImportItems(
  provider: ImportProvider,
  parentId: string
): Promise<ImportBrowserItem[]> {
  const data = await fetchImportJson<ImportItemsResponse>(
    `/api/imports/${provider}/list?parentId=${encodeURIComponent(parentId)}`
  );
  return data.items || [];
}

export async function searchImportItems(
  provider: ImportProvider,
  query: string
): Promise<ImportBrowserItem[]> {
  const data = await fetchImportJson<ImportItemsResponse>(
    `/api/imports/${provider}/search?q=${encodeURIComponent(query)}`
  );
  return data.items || [];
}

/**
 * Resolving a selection is the resource-consuming step: the server fetches the
 * item from the provider and materialises a preview. `signal` is OPTIONAL and
 * purely additive, so callers that have no lifecycle to bind to are unchanged;
 * a caller that can lose the right to publish passes one and the request is
 * dropped with it.
 *
 * A client abort stops this request. It cannot undo a preview the server has
 * already committed -- that orphan remains the import lifecycle's concern.
 */
export async function resolveImportSelection(
  input: ResolveImportSelectionInput,
  signal?: AbortSignal
): Promise<ResolvedImportItem> {
  return fetchImportJson<ResolvedImportItem>('/api/imports/resolve-selection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
}
