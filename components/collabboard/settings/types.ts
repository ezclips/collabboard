// Types for CollabBoard Components

export type LayoutType = 'wall' | 'columns' | 'kanban' | 'gantt' | 'scheduler' | 'grid' | 'table' | 'freeform' | 'timeline' | 'stream' | 'map';

export interface WallpaperSelection {
  type: 'color' | 'gradient' | 'image';
  value: string;
}

export interface PadletPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Padlet {
  id: string;
  title: string;
  content: string;
  date?: string;
  location?: string;
  board_id?: string;
}

export interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

export interface LayoutOption {
  id: LayoutType;
  name: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  description: string;
}

export interface LayoutPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (layout: LayoutType) => void;
}

export interface LayoutSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLayout: LayoutType;
  onSelect: (layout: LayoutType) => void;
}

export interface WallpaperSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  currentSelection: WallpaperSelection;
  onSelect: (type: string, value: string) => void;
}
