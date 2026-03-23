// Microsoft OneDrive (Graph API) helpers — list, search, resolve items.
// Returns normalised ImportBrowserItem objects matching the Google Drive shape.

import type { ImportBrowserItem } from './types';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

interface GraphItem {
  id: string;
  name: string;
  file?: { mimeType?: string };
  folder?: object;
  size?: number;
  thumbnails?: { large?: { url?: string }; medium?: { url?: string } }[];
  webUrl?: string;
  parentReference?: { id?: string };
}

function normalise(item: GraphItem, path: string[] = []): ImportBrowserItem {
  const isFolder = !!item.folder;
  const mimeType = item.file?.mimeType || (isFolder ? 'inode/directory' : 'application/octet-stream');
  return {
    id: item.id,
    name: item.name,
    mimeType,
    sizeBytes: item.size,
    isFolder,
    thumbnailUrl: item.thumbnails?.[0]?.large?.url ?? item.thumbnails?.[0]?.medium?.url,
    iconUrl: undefined,
    openUrl: item.webUrl,
    provider: 'microsoft-onedrive',
    parentId: item.parentReference?.id,
    path,
  };
}

export async function listOneDriveItems(
  accessToken: string,
  parentId = 'root'
): Promise<ImportBrowserItem[]> {
  const path = parentId === 'root'
    ? `${GRAPH_API}/me/drive/root/children`
    : `${GRAPH_API}/me/drive/items/${parentId}/children`;

  const url = `${path}?$select=id,name,file,folder,size,webUrl,parentReference&$expand=thumbnails&$top=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`OneDrive list failed: ${res.status}`);
  const json = await res.json();
  return (json.value || []).map((i: GraphItem) => normalise(i));
}

export async function searchOneDriveItems(
  accessToken: string,
  query: string
): Promise<ImportBrowserItem[]> {
  const url = `${GRAPH_API}/me/drive/root/search(q='${encodeURIComponent(query)}')?$select=id,name,file,folder,size,webUrl,parentReference&$expand=thumbnails&$top=50`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`OneDrive search failed: ${res.status}`);
  const json = await res.json();
  return (json.value || []).map((i: GraphItem) => normalise(i));
}

export async function resolveOneDriveItem(
  accessToken: string,
  itemId: string
): Promise<ImportBrowserItem | null> {
  const url = `${GRAPH_API}/me/drive/items/${itemId}?$select=id,name,file,folder,size,webUrl,parentReference&$expand=thumbnails`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!res.ok) return null;
  const item: GraphItem = await res.json();
  return normalise(item);
}
