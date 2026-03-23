// Main exports for CollabBoard components
export { default as SettingsPanel } from './SettingsPanel';
export { default as LayoutSelectionModal } from './LayoutSelectionModal';
export { default as WallpaperSelector } from '../canvas/WallpaperSelector';
export { layoutOptions } from '../canvas/LayoutComponents';

// Preview components
export { default as WallLayoutPreview } from './previews/WallLayoutPreview';
export { default as ColumnsLayoutPreview } from './previews/ColumnsLayoutPreview';
export { default as GridLayoutPreview } from './previews/GridLayoutPreview';
export { default as TableLayoutPreview } from './previews/TableLayoutPreview';
export { default as TimelineLayoutPreview } from './previews/TimelineLayoutPreview';
export { default as StreamLayoutPreview } from './previews/StreamLayoutPreview';
export { default as FreeformLayoutPreview } from './previews/FreeformLayoutPreview';
export { default as MapLayoutPreview } from './previews/MapLayoutPreview';
export { default as KanbanLayoutPreview } from './previews/KanbanLayoutPreview';

// Data and types
export { samplePadlets, sampleColumns } from './sampleData';
export type {
  LayoutType,
  WallpaperSelection,
  PadletPosition,
  Padlet,
  ColumnData,
  LayoutOption,
  LayoutPreviewProps,
  LayoutSelectionModalProps,
  WallpaperSelectorProps
} from './types';