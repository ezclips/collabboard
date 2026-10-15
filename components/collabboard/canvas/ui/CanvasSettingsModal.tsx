"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, X } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { canEditWorkspace, type WorkspaceRole } from '@/lib/workspace/context';
import { toast } from 'sonner';
import type { Canvas, LayoutType } from '@/types/collabboard';
import WallpaperSelector from '@/components/collabboard/canvas/WallpaperSelector';
import IconSelector from '@/components/collabboard/canvas/IconSelector';
import BoardIconGlyph from '@/components/collabboard/BoardIconGlyph';
import ShareSwitchRow from '@/components/collabboard/canvas/ui/ShareSwitchRow';
import CanvasLayoutTiles from '@/components/collabboard/canvas/ui/CanvasLayoutTiles';
import { canSwitchLayout } from '@/lib/domain/canvas/layoutSwitchFamilies';

/**
 * PATCH-376. A readable name for a board icon. The window used to print the
 * stored value verbatim, so a `lucide:layout` board read "lucide:layout".
 */
function iconDisplayName(icon: string): string | null {
  if (icon.startsWith('lucide:')) {
    const name = icon.slice('lucide:'.length).replace(/-/g, ' ').trim();
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Icon';
  }
  if (icon.startsWith('http') || icon.startsWith('data:')) return 'Image';
  return icon ? 'Emoji' : null;
}

/**
 * PATCH-376. What the wallpaper swatch says -- a kind, never a raw value.
 * `#f3f4f6` reads "Default" because it IS this window's fallback: a board that
 * never chose a wallpaper is stored as exactly that value, so it is the only
 * honest name for it (and the palette's `#ffffff` is the explicit white).
 */
function wallpaperLabel(type: string | null | undefined, value: string | null | undefined): string {
  if (!type || !value) return 'Default';
  if (type === 'image') return 'Image';
  if (type === 'gradient') return 'Gradient';
  const hex = value.toLowerCase();
  if (hex === '#ffffff') return 'White';
  if (hex === '#f3f4f6') return 'Default';
  return 'Colour';
}

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

      // Same family only, re-checked at the write: a cross-family layout would
      // leave every post with nowhere to render (see the family helper).
      if (layout !== canvas?.layout && canSwitchLayout(canvas?.layout, layout)) {
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
          className="z-[4100] gap-0 border-0 bg-transparent p-0 shadow-none sm:max-w-xl"
          showCloseButton={false}
          /* The window has a visible title but no description, and Radix warns
             when neither is declared. */
          aria-describedby={undefined}
          onPointerDownOutside={(event) => {
            // Only block the outside-click-closes-me default while a nested
            // picker (Wallpaper's Google/OneDrive import, Icon selector) is
            // open on top of this dialog -- otherwise a click landing in
            // that picker would count as "outside" and close Settings out
            // from under it. With neither open, let the default close through.
            if (wallpaperDialogOpen || iconDialogOpen) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (wallpaperDialogOpen || iconDialogOpen) event.preventDefault();
          }}
        >
          <DialogClose className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600">
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Close</span>
          </DialogClose>

          {/* PATCH-376. The Share window's shape (PATCH-369): a one-line header,
              one scrolling body, a footer -- so the window fits the screen
              instead of growing past it. */}
          <div
            data-canvas-settings-modal="true"
            className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <DialogTitle className="truncate text-lg font-semibold text-gray-900">Canvas settings</DialogTitle>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
              {!canEdit ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  You do not have permission to change canvas settings.
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="canvas-settings-title">Title</Label>
                <Input
                  id="canvas-settings-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Canvas title"
                  disabled={!canEdit}
                  className="h-8 text-sm focus-visible:border-input focus-visible:ring-0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="canvas-settings-description">Description</Label>
                <Input
                  id="canvas-settings-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional description"
                  disabled={!canEdit}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label>Icon</Label>
                <Button
                  type="button"
                  variant="outline"
                  data-settings-icon-preview="true"
                  onClick={() => setIconDialogOpen(true)}
                  disabled={!canEdit}
                  className="h-8 w-full min-w-0 justify-start gap-2 text-sm"
                >
                  <BoardIconGlyph
                    icon={thumbnail}
                    className="h-5 w-5 shrink-0"
                    imageClassName="h-5 w-5 shrink-0 rounded object-cover"
                  />
                  <span className="truncate">{iconDisplayName(thumbnail) ?? 'Select icon'}</span>
                </Button>
              </div>

              {/* PATCH-376. These three switches had no visible label at all --
                  only an aria-label -- so nobody could tell what they did. Each
                  row now says it, and keeps a meaningful accessible name. */}
              <div className="space-y-1">
                <ShareSwitchRow
                  label="Show title in the board header"
                  hint="Draw the title above the canvas"
                  checked={showTitleInBanner}
                  onToggle={() => setShowTitleInBanner((value) => !value)}
                  disabled={!canEdit}
                  switchData={{ 'data-settings-show-in-header': 'title' }}
                />
                <ShareSwitchRow
                  label="Show description in the board header"
                  hint="Draw the description under the title"
                  checked={showDescriptionInBanner}
                  onToggle={() => setShowDescriptionInBanner((value) => !value)}
                  disabled={!canEdit}
                  switchData={{ 'data-settings-show-in-header': 'description' }}
                />
                <ShareSwitchRow
                  label="Show icon in the board header"
                  hint="Draw the board's icon beside the title"
                  checked={showIconInBanner}
                  onToggle={() => setShowIconInBanner((value) => !value)}
                  disabled={!canEdit}
                  switchData={{ 'data-settings-show-in-header': 'icon' }}
                />
              </div>

              <div className="space-y-2">
                <Label>Wallpaper</Label>
                <Button
                  type="button"
                  variant="outline"
                  data-settings-wallpaper-preview="true"
                  onClick={() => setWallpaperDialogOpen(true)}
                  disabled={!canEdit}
                  className="flex h-12 w-full items-center justify-between"
                >
                  <span className="flex items-center gap-3">
                    <span className="h-8 w-8 rounded border" style={getWallpaperPreviewStyle()} />
                    <span className="text-sm">{wallpaperLabel(wallpaper.type, wallpaper.value)}</span>
                  </span>
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Layout</Label>
                <CanvasLayoutTiles
                  currentLayout={canvas?.layout}
                  selectedLayout={layout}
                  canEdit={canEdit}
                  onSelect={setLayout}
                />
              </div>

              <ShareSwitchRow
                label="Comments"
                hint="Allow users to comment on posts"
                checked={commentsEnabled}
                onToggle={() => setCommentsEnabled((value) => !value)}
                disabled={!canEdit}
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canEdit || saving}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save changes
              </button>
            </div>
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
