// Google Drive API helpers — list, search, resolve items.
// All functions take an access token and return normalised ImportBrowserItem objects.

import type { ImportBrowserItem } from './types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

// MIME types that Google Drive treats as native document editors
const GOOGLE_NATIVE_MIME_TYPES: Record<string, string> = {
  'application/vnd.google-apps.document': 'Google Doc',
  'application/vnd.google-apps.spreadsheet': 'Google Sheet',
  'application/vnd.google-apps.presentation': 'Google Slide',
  'application/vnd.google-apps.form': 'Google Form',
  'application/vnd.google-apps.drawing': 'Google Drawing',
};

function buildOpenUrl(fileId: string, mimeType: string): string {
  if (mimeType in GOOGLE_NATIVE_MIME_TYPES) {
    return `https://docs.google.com/open?id=${fileId}`;
  }
  return `https://drive.google.com/file/d/${fileId}/view`;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  iconLink?: string;
  webViewLink?: string;
  parents?: string[];
}

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'text/plain',
  'text/html',
  'text/csv',
]);

function boostThumbnail(url: string, mimeType: string): { raw: string; proxy: string } {
  // Documents with text benefit from higher resolution; images are fine at s800.
  const size = DOCUMENT_MIME_TYPES.has(mimeType) ? 's1200' : 's800';
  const raw = url.replace(/=s\d+$/, `=${size}`);
  // Proxy through our server so the Authorization header can be attached
  // (browsers cannot send auth headers on <img src> requests).
  const proxy = `/api/imports/google-drive/thumbnail?url=${encodeURIComponent(raw)}`;
  return { raw, proxy };
}

function normalise(file: DriveFile, path: string[] = []): ImportBrowserItem {
  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.size ? parseInt(file.size, 10) : undefined,
    isFolder,
    ...(() => {
      if (!file.thumbnailLink) return {};
      const { raw, proxy } = boostThumbnail(file.thumbnailLink, file.mimeType);
      return { thumbnailUrl: proxy, rawThumbnailUrl: raw };
    })(),
    iconUrl: file.iconLink,
    openUrl: isFolder ? undefined : buildOpenUrl(file.id, file.mimeType),
    provider: 'google-drive',
    path,
  };
}

export async function listGoogleDriveItems(
  accessToken: string,
  parentId = 'root'
): Promise<ImportBrowserItem[]> {
  const fields = 'files(id,name,mimeType,size,thumbnailLink,iconLink,webViewLink,parents)';
  const q = `'${parentId}' in parents and trashed = false`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=100&orderBy=folder,name`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Google Drive list failed: ${res.status}`);
  const json = await res.json();
  return (json.files || []).map((f: DriveFile) => normalise(f));
}

export async function searchGoogleDriveItems(
  accessToken: string,
  query: string
): Promise<ImportBrowserItem[]> {
  const fields = 'files(id,name,mimeType,size,thumbnailLink,iconLink,webViewLink,parents)';
  const q = `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=50&orderBy=name`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Google Drive search failed: ${res.status}`);
  const json = await res.json();
  return (json.files || []).map((f: DriveFile) => normalise(f));
}

export async function resolveGoogleDriveItem(
  accessToken: string,
  fileId: string
): Promise<ImportBrowserItem | null> {
  const fields = 'id,name,mimeType,size,thumbnailLink,iconLink,webViewLink,parents';
  const url = `${DRIVE_API}/files/${fileId}?fields=${encodeURIComponent(fields)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!res.ok) return null;
  const file: DriveFile = await res.json();
  return normalise(file);
}
