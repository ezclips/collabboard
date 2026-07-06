"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Columns3, Grid3X3, Layers3, Clock, Loader2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { canEditWorkspace, type WorkspaceRole } from '@/lib/workspace/context';
import { toast } from 'sonner';
import type { Canvas, LayoutType } from '@/types/collabboard';
import WallpaperSelector from '@/components/collabboard/canvas/WallpaperSelector';
import IconSelector from '@/components/collabboard/canvas/IconSelector';

// Switching into any of these layouts only ever touches boards.layout — no other
// layout requires migrating existing padlets/sections, so they're safe to offer here.
// Kanban/Gantt/Scheduler/Map/Drawing/Freeform each depend on structures (kanban_columns,
// map pins, etc.) that a blind layout swap would leave inconsistent, so they're excluded.
const SWITCHABLE_LAYOUTS: { id: LayoutType; name: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'wall', name: 'Wall', icon: Layers3 },
  { id: 'columns', name: 'Columns', icon: Columns3 },
  { id: 'grid', name: 'Grid', icon: Grid3X3 },
  { id: 'timeline', name: 'Timeline', icon: Clock },
];

interface CanvasSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvasId: string;
  canvas: Canvas | null;
  hasSections: boolean;
  currentWorkspaceRole: WorkspaceRole | null;
  onSaved: () => void;
}

export default function CanvasSettingsModal({
  isOpen,
  onClose,
  canvasId,
  canvas,
  hasSections,
  currentWorkspaceRole,
  onSaved,
}: CanvasSettingsModalProps) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const canEdit = canEditWorkspace(currentWorkspaceRole);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnail, setThumbnail] = useState('🎨');
  const [wallpaper, setWallpaper] = useState<{ type: 'color' | 'gradient' | 'image'; value: string }>({
    type: 'color',
    value: '#f3f4f6',
  });
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  // Independent per-element visibility for the title banner above the canvas —
  // each switch sits next to the field it actually controls.
  const [showTitleInBanner, setShowTitleInBanner] = useState(false);
  const [showDescriptionInBanner, setShowDescriptionInBanner] = useState(false);
  const [showIconInBanner, setShowIconInBanner] = useState(false);
  const [layout, setLayout] = useState<LayoutType>('wall');
  const [saving, setSaving] = useState(false);
  const [wallpaperDialogOpen, setWallpaperDialogOpen] = useState(false);
  const [iconDialogOpen, setIconDialogOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !canvas) return;
    const titleHeader = (canvas.settings as any)?.titleHeader || {};
    setTitle(canvas.title || '');
    setDescription(canvas.description || '');
    setThumbnail((canvas as any).thumbnail || '🎨');
    setWallpaper({
      type: canvas.background_type || 'color',
      value: canvas.background_value || '#f3f4f6',
    });
    setCommentsEnabled((canvas as any).comments_enabled ?? true);
    setShowTitleInBanner(Boolean(titleHeader.showTitle));
    setShowDescriptionInBanner(Boolean(titleHeader.showDescription));
    setShowIconInBanner(Boolean(titleHeader.showIcon));
    setLayout(canvas.layout);
  }, [isOpen, canvas]);

  const layoutIsSwitchable = SWITCHABLE_LAYOUTS.some((option) => option.id === canvas?.layout);

  const handleSave = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to change canvas settings');
      return;
    }
    if (!title.trim()) {
      toast.error('Title cannot be empty');
      return;
    }

    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        thumbnail,
        background_type: wallpaper.type,
        background_value: wallpaper.value,
        comments_enabled: commentsEnabled,
        // titleHeader is a new field with no top-level column, so it lives in
        // settings — merge rather than overwrite so we don't clobber other
        // keys already stored there (chronoMode, mapStyleId, etc.).
        settings: {
          ...(canvas?.settings || {}),
          titleHeader: {
            showTitle: showTitleInBanner,
            showDescription: showDescriptionInBanner,
            showIcon: showIconInBanner,
          },
        },
        updated_at: new Date().toISOString(),
      };

      if (layoutIsSwitchable && layout !== canvas?.layout) {
        updates.layout = layout;
      }

      const { error } = await supabase.from('boards').update(updates).eq('id', canvasId);
      if (error) throw error;

      // Columns needs at least one section for posts to land in; create a default
      // one so switching into Columns on a canvas that never had any doesn't
      // silently hide every existing post.
      if (updates.layout === 'columns' && !hasSections) {
        const { error: sectionError } = await supabase.from('board_sections').insert({
          board_id: canvasId,
          title: 'General',
          description: '',
          position: 0,
        });
        if (sectionError) {
          console.error('Failed to create default section for columns layout:', sectionError);
        }
      }

      toast.success('Canvas settings saved');
      onSaved();
      onClose();
    } catch (error) {
      console.error('Failed to save canvas settings:', error);
      toast.error('Failed to save canvas settings');
    } finally {
      setSaving(false);
    }
  };

  const getWallpaperPreviewStyle = (): React.CSSProperties => {
    if (wallpaper.type === 'image') {
      return { backgroundImage: `url("${wallpaper.value}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
    }
    if (wallpaper.type === 'gradient') {
      return { background: wallpaper.value };
    }
    return { backgroundColor: wallpaper.value };
  };

  return (
    <>
      {isOpen ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[4000] bg-black/50 backdrop-blur-sm pointer-events-none"
        />
      ) : null}

      {/* modal={false}: this Dialog stays open while WallpaperSelector opens its
          own Google/OneDrive picker on top. Radix's default modal lock marks
          everything outside its own portaled content as inert, which would
          freeze that nested (non-Radix, portaled-to-body) picker underneath. */}
      <Dialog open={isOpen} onOpenChange={onClose} modal={false}>
        <DialogContent
          className="z-[4100] sm:max-w-xl max-h-[85vh] overflow-y-auto"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Canvas settings</DialogTitle>
          </DialogHeader>

          {!canEdit ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You do not have permission to change canvas settings.
            </div>
          ) : null}

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="canvas-settings-title">Title</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="canvas-settings-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Canvas title"
                  disabled={!canEdit}
                  className="h-8 flex-1 text-sm focus-visible:border-input focus-visible:ring-0"
                />
                <Switch
                  aria-label="Show title in banner"
                  checked={showTitleInBanner}
                  onCheckedChange={setShowTitleInBanner}
                  disabled={!canEdit}
                  className="flex-shrink-0 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="canvas-settings-description">Description</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="canvas-settings-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional description"
                  disabled={!canEdit}
                  className="h-8 flex-1 text-sm"
                />
                <Switch
                  aria-label="Show description in banner"
                  checked={showDescriptionInBanner}
                  onCheckedChange={setShowDescriptionInBanner}
                  disabled={!canEdit}
                  className="flex-shrink-0 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIconDialogOpen(true)}
                  disabled={!canEdit}
                  className="h-8 min-w-0 flex-1 justify-start gap-2 text-sm"
                >
                  {thumbnail.startsWith('http') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnail} alt="" className="h-5 w-5 flex-shrink-0 rounded object-cover" />
                  ) : (
                    <span className="flex-shrink-0">{thumbnail}</span>
                  )}
                  <span className="truncate">Select icon</span>
                </Button>
                <Switch
                  aria-label="Show icon in banner"
                  checked={showIconInBanner}
                  onCheckedChange={setShowIconInBanner}
                  disabled={!canEdit}
                  className="flex-shrink-0 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Wallpaper</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setWallpaperDialogOpen(true)}
                disabled={!canEdit}
                className="w-full justify-between h-12"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded border" style={getWallpaperPreviewStyle()} />
                  <span>Current wallpaper</span>
                </div>
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Layout</Label>
              {layoutIsSwitchable ? (
                <div className="grid grid-cols-4 gap-2">
                  {SWITCHABLE_LAYOUTS.map((option) => {
                    const IconComponent = option.icon;
                    const isSelected = layout === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setLayout(option.id)}
                        className={`flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          isSelected ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <IconComponent size={18} />
                        {option.name}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                  Layout switching isn&apos;t available for this canvas type.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <Label>Comments</Label>
                <p className="text-xs text-gray-500">Allow users to comment on posts</p>
              </div>
              <Switch
                checked={commentsEnabled}
                onCheckedChange={setCommentsEnabled}
                disabled={!canEdit}
                className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-gray-300"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!canEdit || saving}
              className="border-2 border-gray-900"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <WallpaperSelector
        isOpen={wallpaperDialogOpen}
        onClose={() => setWallpaperDialogOpen(false)}
        currentSelection={wallpaper}
        onSelect={(type, value) => {
          setWallpaper({ type: type as 'color' | 'gradient' | 'image', value });
          setWallpaperDialogOpen(false);
        }}
      />

      <IconSelector
        isOpen={iconDialogOpen}
        onClose={() => setIconDialogOpen(false)}
        selectedIcon={thumbnail}
        onSelect={setThumbnail}
      />
    </>
  );
}
