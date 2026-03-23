// Shared types for the imports feature

export type ImportProvider = 'google-drive' | 'microsoft-onedrive';
export type ImportKind = 'image' | 'document';

// Normalised file/folder item returned by all provider list/search routes
export type ImportBrowserItem = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  isFolder: boolean;
  thumbnailUrl?: string;       // proxy URL for client-side <img src> display
  rawThumbnailUrl?: string;    // original provider URL for server-side fetching
  iconUrl?: string;
  openUrl?: string;
  provider: ImportProvider;
  parentId?: string;
  path?: string[];
};

// Payload stored in padlet.metadata when source === 'import'
export type ImportedImageMetadata = {
  imageUrl: string;
  file_url?: string;
  source: 'import';
  importProvider: ImportProvider;
  importItemId: string;
  importFileName: string;
  importMimeType: string;
  importOpenUrl: string;
  importThumbnailUrl?: string;
  importKind: ImportKind;
  importExtension?: string;
  importSizeBytes?: number;
  importFolderPath?: string[];
  topStrip?: string;
  cardColor?: string;
  caption?: string;
};

// What the resolve-selection route returns
export type ResolvedImportItem = {
  previewImageUrl: string;
  openUrl: string;
  provider: ImportProvider;
  itemId: string;
  name: string;
  mimeType: string;
  kind: ImportKind;
  sizeBytes?: number;
};

// Connection status returned by /api/imports/status
export type ImportProviderStatus = {
  provider: ImportProvider;
  connected: boolean;
  email: string | null;
};
