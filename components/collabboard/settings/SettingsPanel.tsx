'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { X, ChevronRight, Calendar } from 'lucide-react';
import WallpaperSelector from '../canvas/WallpaperSelector';
import LayoutSelectionModal from './LayoutSelectionModal';
import { layoutOptions } from '../canvas/LayoutComponents';
import type { LayoutType, WallpaperSelection } from './types';

interface SettingsPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
  isOpen = true, 
  onClose = () => {} 
}) => {
  const [wallpaperModalOpen, setWallpaperModalOpen] = useState(false);
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  
  // Settings state
  const [title, setTitle] = useState('Timeline');
  const [description, setDescription] = useState('Scroll to view');
  const [selectedLayout, setSelectedLayout] = useState<LayoutType>('timeline');
  const [wallpaper, setWallpaper] = useState<WallpaperSelection>({ 
    type: 'image', 
    value: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop' 
  });
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  const [newPostsAtTop, setNewPostsAtTop] = useState(true);
  const [groupBySection, setGroupBySection] = useState(false);

  const handleWallpaperSelect = (type: string, value: string) => {
    setWallpaper({ type: type as 'color' | 'gradient' | 'image', value });
    setWallpaperModalOpen(false);
  };

  const handleLayoutSelect = (layoutId: LayoutType) => {
    setSelectedLayout(layoutId);
    setLayoutModalOpen(false);
  };

  const selectedLayoutInfo = layoutOptions.find(l => l.id === selectedLayout);

  const getBackgroundStyle = () => {
    switch (wallpaper.type) {
      case 'color': return { backgroundColor: wallpaper.value };
      case 'gradient': return { background: wallpaper.value };
      case 'image': return { 
        backgroundImage: `url("${wallpaper.value}")`, 
        backgroundSize: 'cover', 
        backgroundPosition: 'center' 
      };
      default: return { backgroundColor: '#22c55e' };
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={getBackgroundStyle()}>
      <div className="absolute inset-0 bg-black bg-opacity-30"></div>
      
      <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col relative z-10">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Settings</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <Tabs defaultValue="heading" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-6 text-xs px-2">
            <TabsTrigger value="heading" className="text-xs">Heading</TabsTrigger>
            <TabsTrigger value="appearance" className="text-xs">Appearance</TabsTrigger>
            <TabsTrigger value="layout" className="text-xs">Layout</TabsTrigger>
            <TabsTrigger value="engagement" className="text-xs">Engagement</TabsTrigger>
            <TabsTrigger value="posts" className="text-xs">Posts</TabsTrigger>
            <TabsTrigger value="content" className="text-xs">Content</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-4">
            <TabsContent value="heading" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Heading</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm text-gray-700">Title</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 bg-gray-100" />
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Description</Label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 bg-gray-100" />
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Icon</Label>
                    <Button variant="outline" className="w-full justify-between mt-1">
                      <Calendar className="w-4 h-4" />
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="appearance" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Appearance</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-gray-700">Wallpaper</Label>
                    <Button
                      variant="outline"
                      className="w-full justify-between mt-1 h-12"
                      onClick={() => setWallpaperModalOpen(true)}
                    >
                      <div className="w-8 h-6 rounded border" style={getBackgroundStyle()} />
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Color scheme</Label>
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm" className="flex-1">Dark</Button>
                      <Button variant="default" size="sm" className="flex-1 bg-purple-600">Light</Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Font</Label>
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm">ABaa</Button>
                      <Button variant="outline" size="sm">ABaa</Button>
                      <Button variant="outline" size="sm">ABaa</Button>
                      <Button variant="default" size="sm" className="bg-purple-600">ABaa</Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Post size</Label>
                    <div className="flex gap-2 mt-2">
                      <Button variant="default" size="sm" className="flex-1 bg-purple-600">Standard</Button>
                      <Button variant="outline" size="sm" className="flex-1">Wide</Button>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="layout" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Layout</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-gray-700">Format</Label>
                    <p className="text-xs text-gray-500 mb-2">Choose how posts are laid out.</p>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => setLayoutModalOpen(true)}
                    >
                      <div className="flex items-center gap-2">
                        {selectedLayoutInfo && React.createElement(selectedLayoutInfo.icon, { className: "w-4 h-4" })}
                        <span>{selectedLayoutInfo?.name || 'Timeline'}</span>
                      </div>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-gray-700">Group posts by section</Label>
                    </div>
                    <Switch checked={groupBySection} onCheckedChange={setGroupBySection} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="engagement" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Engagement</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-gray-700">Comments</Label>
                      <p className="text-xs text-gray-500">Allow visitors to comment on posts</p>
                    </div>
                    <Switch checked={commentsEnabled} onCheckedChange={setCommentsEnabled} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-gray-700">Reactions</Label>
                      <p className="text-xs text-gray-500">Allow visitors to react to posts</p>
                    </div>
                    <Switch checked={reactionsEnabled} onCheckedChange={setReactionsEnabled} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="posts" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Posts</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-gray-700">New posts at top</Label>
                      <p className="text-xs text-gray-500">Place newest posts at the beginning</p>
                    </div>
                    <Switch checked={newPostsAtTop} onCheckedChange={setNewPostsAtTop} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="content" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Content</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-gray-700">Allowed content types</Label>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <label className="text-sm">Text</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <label className="text-sm">Images</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" className="rounded" />
                        <label className="text-sm">Videos</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" className="rounded" />
                        <label className="text-sm">Links</label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Wallpaper Modal */}
        <WallpaperSelector
          isOpen={wallpaperModalOpen}
          onClose={() => setWallpaperModalOpen(false)}
          currentSelection={wallpaper}
          onSelect={handleWallpaperSelect}
        />

        {/* Layout Selection Modal */}
        <LayoutSelectionModal
          isOpen={layoutModalOpen}
          onClose={() => setLayoutModalOpen(false)}
          selectedLayout={selectedLayout}
          onSelect={handleLayoutSelect}
        />
      </div>
    </div>
  );
};

export default SettingsPanel;