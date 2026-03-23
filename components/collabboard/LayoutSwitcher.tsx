// components/collabboard/LayoutSwitcher.tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from '@/components/ui/sheet';
import { 
  Settings, 
  Grid3x3, 
  Columns, 
  Layout, 
  Clock, 
  Map,
  List,
  MousePointer,
  Table
} from 'lucide-react';
import type { LayoutType } from '@/lib/collabboard/types';

interface LayoutConfig {
  id: LayoutType;
  name: string;
  description?: string;
}
type ContainerSize = 'small' | 'medium' | 'large';

interface LayoutSwitcherProps {
  currentLayout: LayoutType;
  availableLayouts: LayoutConfig[];
  onLayoutChange: (layout: LayoutType) => void;
  onSettingsChange?: (settings: Record<string, any>) => void;
  currentSettings?: Record<string, any>;
  disabled?: boolean;
  // Container size props
  containerSize?: ContainerSize;
  onContainerSizeChange?: (size: ContainerSize) => void;
}

// Layout Icons Mapping
const layoutIcons: Partial<Record<LayoutType, React.ComponentType<any>>> = {
  wall: Layout,
  columns: Columns,
  grid: Grid3x3,
  table: Table,
  freeform: MousePointer,
  timeline: Clock,
  stream: List,
  map: Map,
};

export function LayoutSwitcher({ 
  currentLayout, 
  availableLayouts, 
  onLayoutChange,
  onSettingsChange,
  currentSettings = {},
  disabled = false,
  containerSize = 'medium',
  onContainerSizeChange
}: LayoutSwitcherProps) {
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  
  const currentLayoutConfig = availableLayouts.find(l => l.id === currentLayout);
  const CurrentLayoutIcon = layoutIcons[currentLayout] || Layout;

  const handleLayoutSelect = (layoutType: LayoutType) => {
    if (layoutType !== currentLayout) {
      onLayoutChange(layoutType);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Layout Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="flex items-center gap-2"
          >
            <CurrentLayoutIcon className="h-4 w-4" />
            <span className="hidden sm:inline">
              {currentLayoutConfig?.name || 'Layout'}
            </span>
            <Badge variant="secondary" className="hidden md:inline">
              {availableLayouts.length}
            </Badge>
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="start" className="w-64 bg-white border shadow-xl z-50">
          <DropdownMenuLabel>Switch Layout</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {availableLayouts.map((layout) => {
            const IconComponent = layoutIcons[layout.id];
            const isActive = layout.id === currentLayout;

            return (
              <DropdownMenuItem
                key={layout.id}
                onClick={() => handleLayoutSelect(layout.id)}
                className={`flex items-center gap-3 p-3 cursor-pointer ${
                  isActive ? 'bg-muted' : ''
                }`}
              >
                {IconComponent && <IconComponent className="h-4 w-4" />}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{layout.name}</span>
                    {isActive && (
                      <Badge variant="default" className="text-xs">
                        Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {layout.description}
                  </p>
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Settings Button */}
      {onSettingsChange && (
        <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </SheetTrigger>
          
          <SheetContent side="right" className="w-80 bg-white border-l">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <CurrentLayoutIcon className="h-5 w-5" />
                {currentLayoutConfig?.name} Settings
              </SheetTitle>
            </SheetHeader>
            
            <div className="mt-6 space-y-4">
              {/* Container size settings removed */}

              <LayoutSettingsForm
                layoutType={currentLayout}
                settings={currentSettings}
                onSettingsChange={onSettingsChange}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

// Layout Settings Form Component
interface LayoutSettingsFormProps {
  layoutType: LayoutType;
  settings: Record<string, any>;
  onSettingsChange: (settings: Record<string, any>) => void;
}

function LayoutSettingsForm({ 
  layoutType, 
  settings, 
  onSettingsChange 
}: LayoutSettingsFormProps) {
  const handleSettingChange = (key: string, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  // Dynamic settings based on layout type
  const renderSettings = () => {
    switch (layoutType) {
      case 'wall':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Column Width</label>
              <input
                type="range"
                min="200"
                max="400"
                value={settings.columnWidth || 300}
                onChange={(e) => handleSettingChange('columnWidth', Number(e.target.value))}
                className="w-full mt-2"
              />
              <span className="text-xs text-muted-foreground">
                {settings.columnWidth || 300}px
              </span>
            </div>
            <div>
              <label className="text-sm font-medium">Gap</label>
              <input
                type="range"
                min="8"
                max="32"
                value={settings.gap || 16}
                onChange={(e) => handleSettingChange('gap', Number(e.target.value))}
                className="w-full mt-2"
              />
              <span className="text-xs text-muted-foreground">
                {settings.gap || 16}px
              </span>
            </div>
          </div>
        );

      case 'grid':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Columns</label>
              <input
                type="range"
                min="2"
                max="8"
                value={settings.columns || 4}
                onChange={(e) => handleSettingChange('columns', Number(e.target.value))}
                className="w-full mt-2"
              />
              <span className="text-xs text-muted-foreground">
                {settings.columns || 4} columns
              </span>
            </div>
            <div>
              <label className="text-sm font-medium">Aspect Ratio</label>
              <select
                value={settings.aspectRatio || '1:1'}
                onChange={(e) => handleSettingChange('aspectRatio', e.target.value)}
                className="w-full mt-2 p-2 border rounded"
              >
                <option value="1:1">Square (1:1)</option>
                <option value="4:3">Standard (4:3)</option>
                <option value="16:9">Wide (16:9)</option>
                <option value="3:4">Portrait (3:4)</option>
              </select>
            </div>
          </div>
        );

      case 'timeline':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Timeline Height</label>
              <input
                type="range"
                min="100"
                max="300"
                value={settings.timelineHeight || 200}
                onChange={(e) => handleSettingChange('timelineHeight', Number(e.target.value))}
                className="w-full mt-2"
              />
              <span className="text-xs text-muted-foreground">
                {settings.timelineHeight || 200}px
              </span>
            </div>
            <div>
              <label className="text-sm font-medium">Show Dates</label>
              <input
                type="checkbox"
                checked={settings.showDates || true}
                onChange={(e) => handleSettingChange('showDates', e.target.checked)}
                className="ml-2"
              />
            </div>
          </div>
        );

      case 'columns':
        return (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Column Width</label>
              <input
                type="range"
                min="250"
                max="400"
                value={settings.columnWidth || 300}
                onChange={(e) => handleSettingChange('columnWidth', Number(e.target.value))}
                className="w-full mt-2"
              />
              <span className="text-xs text-muted-foreground">
                {settings.columnWidth || 300}px
              </span>
            </div>
            <div>
              <label className="text-sm font-medium">Enable Drag & Drop</label>
              <input
                type="checkbox"
                checked={settings.enableDragDrop !== false}
                onChange={(e) => handleSettingChange('enableDragDrop', e.target.checked)}
                className="ml-2"
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="text-sm text-muted-foreground">
            No settings available for this layout.
          </div>
        );
    }
  };

  return (
    <Card className="bg-white border">
      <CardContent className="pt-6">
        {renderSettings()}
      </CardContent>
    </Card>
  );
}

// Layout Preview Component
interface LayoutPreviewProps {
  layoutType: LayoutType;
  isActive: boolean;
  onClick: () => void;
}

export function LayoutPreview({ layoutType, isActive, onClick }: LayoutPreviewProps) {
  const IconComponent = layoutIcons[layoutType];

  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border transition-all ${
        isActive
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-border hover:border-primary/50 hover:bg-muted/50'
      }`}
    >
      {IconComponent && <IconComponent className="h-8 w-8 mx-auto mb-2" />}
      <span className="text-sm font-medium capitalize">{layoutType}</span>
    </button>
  );
}
