// Re-export shared types used by import UI components
export type { ImportProvider, ImportBrowserItem, ResolvedImportItem } from '@/lib/imports/types';

export type ImportDialogState =
  | { screen: 'chooser' }
  | { screen: 'browser'; provider: import('@/lib/imports/types').ImportProvider }
  | { screen: 'connection-required'; provider: import('@/lib/imports/types').ImportProvider };
