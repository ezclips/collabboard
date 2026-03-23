'use client';

import React, { useState, useEffect } from "react";
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronRight,
  ArrowLeft,
  Loader2,
  Settings,
  Palette,
  LayoutGrid,
} from "lucide-react";
import { useSupabase } from '@/lib/supabase';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';
import {
  buildBoardAccessMetadata,
  createDefaultWorkspaceAccessPolicy,
  normalizeWorkspaceAccessPolicy,
} from '@/lib/workspace/access-policy';

// Import the separated components
import { LayoutSelectionModal, PreviewModal, layoutOptions, getLayoutFunction, LayoutType, PadletPosition } from '@/components/collabboard/canvas/LayoutComponents';
import WallpaperSelector, { WallpaperSelection } from '@/components/collabboard/canvas/WallpaperSelector';
import IconSelector from '@/components/collabboard/canvas/IconSelector';

// Interfaces
interface Padlet {
  id: string;
  title: string;
  content: string;
  board_id?: string;
}

interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

// Main Component
const CanvasSetupPage: React.FC = () => {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  // Canvas settings
  const [title, setTitle] = useState("My Canvas");
  const [description, setDescription] = useState("A collaborative workspace");
  const [selectedIcon, setSelectedIcon] = useState("🎨");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  const [selectedWallpaper, setSelectedWallpaper] = useState<WallpaperSelection>({ 
    type: 'color', 
    value: '#ffffff' 
  });
  const [newPostsAtTop, setNewPostsAtTop] = useState(true);
  const [layout, setLayout] = useState<LayoutType>('wall');
  
  // UI State
  const [currentView, setCurrentView] = useState<'setup' | 'wallpaper'>('setup');
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [showIconSelector, setShowIconSelector] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewLayout, setPreviewLayout] = useState<LayoutType | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const [canvasWidth, setCanvasWidth] = useState(1200);
  const [canvasHeight, setCanvasHeight] = useState(800);
  const [positions, setPositions] = useState<PadletPosition[]>([]);
  
  // Sample data for preview
  const [samplePadlets] = useState<Padlet[]>([
    { id: 'sample-1', title: 'Welcome!', content: 'This is your new canvas. Add content and arrange it however you like.' },
    { id: 'sample-2', title: 'Collaborate', content: 'Invite team members to work together in real-time.' },
    { id: 'sample-3', title: 'Organize', content: 'Switch between different layouts to organize your content.' },
    { id: 'sample-4', title: 'Customize', content: 'Change colors, wallpapers, and settings to match your style.' },
    { id: 'sample-5', title: 'Share', content: 'Share your canvas with others or export your work.' },
    { id: 'sample-6', title: 'Discover', content: 'Explore new features and possibilities.' },
  ]);

  const [columns, setColumns] = useState<ColumnData[]>([
    { 
      id: 'column-1', 
      title: 'Ideas', 
      items: [samplePadlets[0], samplePadlets[1]]
    },
    { 
      id: 'column-2', 
      title: 'In Progress', 
      items: [samplePadlets[2], samplePadlets[3]]
    },
    { 
      id: 'column-3', 
      title: 'Done', 
      items: [samplePadlets[4], samplePadlets[5]]
    }
  ]);

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();
          
          setUser(profile || session.user);
        }
      } catch (error) {
        console.error('Error getting user:', error);
      }
    };

    getCurrentUser();
  }, [supabase]);

  // Enhanced wall layout function for masonry effect
  const getWallLayoutPositions = (count: number, containerWidth: number): PadletPosition[] => {
    const positions: PadletPosition[] = [];
    const itemWidth = 200;
    const baseHeight = 140;
    const padding = 16;
    
    const cols = Math.floor((containerWidth - padding) / (itemWidth + padding));
    const maxCols = Math.max(cols, 2);
    
    // Track height of each column for masonry effect
    const columnHeights: number[] = new Array(maxCols).fill(padding);
    
    // Height variations for masonry effect
    const heightVariations = [baseHeight, baseHeight + 60, baseHeight + 120, baseHeight - 40, baseHeight + 30];
    
    for (let i = 0; i < count; i++) {
      // Find shortest column
      let shortestColIndex = 0;
      let shortestHeight = columnHeights[0];
      
      for (let j = 1; j < maxCols; j++) {
        if (columnHeights[j] < shortestHeight) {
          shortestHeight = columnHeights[j];
          shortestColIndex = j;
        }
      }
      
      const itemHeight = heightVariations[i % heightVariations.length];
      const left = shortestColIndex * (itemWidth + padding) + padding;
      const top = columnHeights[shortestColIndex];
      
      positions.push({
        top,
        left,
        width: itemWidth,
        height: itemHeight
      });
      
      columnHeights[shortestColIndex] += itemHeight + padding;
    }
    
    return positions;
  };

  // Calculate positions when layout changes
  useEffect(() => {
    if (layout !== 'columns') {
      const allPadlets = columns.flatMap(col => col.items);
      const displayedPadlets = newPostsAtTop ? [...allPadlets].reverse() : allPadlets;
      
      if (layout === 'wall') {
        const newPositions = getWallLayoutPositions(displayedPadlets.length, canvasWidth);
        setPositions(newPositions);
      } else {
        const calculatePositions = getLayoutFunction(layout);
        const newPositions = calculatePositions(displayedPadlets.length, canvasWidth, canvasHeight);
        setPositions(newPositions);
      }
    }
  }, [layout, columns, newPostsAtTop, canvasWidth, canvasHeight]);

  // Handlers
  const handleWallpaperSelect = (type: string, value: string) => {
    setSelectedWallpaper({ type: type as 'color' | 'gradient' | 'image', value });
    setCurrentView('setup');
  };

  const handleFileSelect = async (file: File) => {
    setUploadingImage(true);
    setUploadError(null);
    
    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `wallpapers/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars') // Using existing bucket
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setSelectedWallpaper({ type: 'image', value: data.publicUrl });
      setCurrentView('setup');
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadError('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleLayoutPreview = (layoutType: LayoutType) => {
    setPreviewLayout(layoutType);
    setShowPreviewModal(true);
    setShowLayoutModal(false);
  };

  const handleLayoutSelect = (layoutType: LayoutType) => {
    setLayout(layoutType);
    setShowLayoutModal(false);
  };

  const handleSaveCanvas = async () => {
    if (!user) {
      alert('Please log in to save your canvas');
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        throw new Error('Please log in to save your canvas');
      }

      const resolvedWorkspace = await resolveCurrentWorkspace(supabase, authUser).catch(() => null);
      let boardAccessPolicy = createDefaultWorkspaceAccessPolicy();

      if (resolvedWorkspace?.workspaceId) {
        const { data: workspaceSettings } = await supabase
          .from('workspace_settings')
          .select('access_policy')
          .eq('workspace_id', resolvedWorkspace.workspaceId)
          .maybeSingle();

        boardAccessPolicy = normalizeWorkspaceAccessPolicy(workspaceSettings?.access_policy);
      }

      // Create canvas in database
      const { data: canvas, error: canvasError } = await supabase
        .from('boards')
        .insert([
          {
            title: title,
            description: description,
            layout: layout,
            background_type: selectedWallpaper.type,
            background_value: selectedWallpaper.value,
            comments_enabled: commentsEnabled,
            reactions_enabled: reactionsEnabled,
            thumbnail: selectedIcon,
            user_id: authUser.id,
            workspace_id: resolvedWorkspace?.workspaceId ?? null,
            metadata: buildBoardAccessMetadata(boardAccessPolicy),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (canvasError) {
        throw canvasError;
      }

      // If columns layout, save sections
      if (layout === 'columns') {
        const sectionsToInsert = columns.map((column, index) => ({
          board_id: canvas.id,
          title: column.title,
          description: `Column ${index + 1}`,
          position: index + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: sectionsError } = await supabase
          .from('board_sections')
          .insert(sectionsToInsert);

        if (sectionsError) {
          throw sectionsError;
        }
      }

      alert('Canvas saved successfully!');
      router.push(`/dashboard/canvas/${canvas.id}`);
      
    } catch (error: any) {
      console.error('Error saving canvas:', error);
      alert('Error saving canvas: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentBackground = (): React.CSSProperties => {
    if (selectedWallpaper.type === 'color') {
      return { backgroundColor: selectedWallpaper.value };
    }
    if (selectedWallpaper.type === 'gradient') {
      return { background: selectedWallpaper.value };
    }
    if (selectedWallpaper.value && selectedWallpaper.type === 'image') {
      return {
        backgroundImage: `url("${selectedWallpaper.value}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      };
    }
    return { backgroundColor: '#f3f4f6' };
  };

  const selectedLayoutInfo = layoutOptions.find(l => l.id === layout);

  const renderPreview = () => {
    if (layout === 'columns') {
      return (
        <div className="flex gap-4 h-full overflow-x-auto p-4">
          {columns.map(col => (
            <div key={col.id} className="flex flex-col w-80 bg-slate-200/80 rounded-lg p-4 flex-shrink-0">
              <h3 className="font-bold text-sm mb-4">{col.title}</h3>
              <div className="space-y-2">
                {col.items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white p-3 rounded-lg shadow-sm border"
                  >
                    <h4 className="font-medium text-sm mb-1">{item.title}</h4>
                    <p className="text-xs text-gray-600 line-clamp-3">{item.content}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    } else {
      const allPadlets = columns.flatMap(col => col.items);
      const displayedPadlets = newPostsAtTop ? [...allPadlets].reverse() : allPadlets;

      return (
        <div className="relative w-full p-4" style={{ minHeight: '600px', height: '600px' }}>
          {displayedPadlets.map((padlet, index) => (
            positions[index] && (
              <div
                key={padlet.id}
                className="absolute bg-white p-4 rounded-lg shadow-md border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
                style={{
                  top: `${positions[index].top}px`,
                  left: `${positions[index].left}px`,
                  width: `${positions[index].width}px`,
                  height: `${positions[index].height}px`,
                  maxWidth: '200px'
                }}
              >
                <h4 className="font-medium text-sm mb-2 text-gray-900">{padlet.title}</h4>
                <p className="text-xs text-gray-600 leading-relaxed overflow-hidden">{padlet.content}</p>
              </div>
            )
          ))}
        </div>
      );
    }
  };

  // Settings Panel Component
  const SettingsPanel = () => (
    <Dialog open={showSettingsPanel} onOpenChange={setShowSettingsPanel}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Canvas Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 p-4">
          <div className="space-y-4">
            <div>
              <Label htmlFor="settings-title">Title</Label>
              <Input 
                id="settings-title" 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
              />
            </div>
            <div>
              <Label htmlFor="settings-description">Description</Label>
              <Input 
                id="settings-description" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
              />
            </div>
            <div>
              <Label>Icon</Label>
              <Button 
                variant="outline" 
                className="w-full justify-between mt-1"
                onClick={() => setShowIconSelector(true)}
              >
                <span className="text-xl">{selectedIcon}</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Wallpaper</Label>
              <Button 
                variant="outline" 
                className="w-full justify-between mt-1 h-12"
                onClick={() => setCurrentView('wallpaper')}
              >
                <div 
                  className="w-8 h-6 rounded border"
                  style={getCurrentBackground()}
                />
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Layout</Label>
              <Button 
                variant="outline" 
                className="w-full justify-between mt-1"
                onClick={() => setShowLayoutModal(true)}
              >
                <div className="flex items-center gap-2">
                  {selectedLayoutInfo?.icon}
                  <span>{selectedLayoutInfo?.name}</span>
                </div>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Comments</Label>
                <p className="text-xs text-gray-500">Allow users to comment</p>
              </div>
              <Switch checked={commentsEnabled} onCheckedChange={setCommentsEnabled} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Reactions</Label>
                <p className="text-xs text-gray-500">Allow users to react</p>
              </div>
              <Switch checked={reactionsEnabled} onCheckedChange={setReactionsEnabled} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>New Posts at Top</Label>
                <p className="text-xs text-gray-500">Place newest posts first</p>
              </div>
              <Switch checked={newPostsAtTop} onCheckedChange={setNewPostsAtTop} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Saving canvas...</span>
      </div>
    );
  }

  // Wallpaper Selector View
  if (currentView === 'wallpaper') {
    return (
      <WallpaperSelector
        onSelect={handleWallpaperSelect}
        onBack={() => setCurrentView('setup')}
        currentSelection={selectedWallpaper}
        onFileSelect={handleFileSelect}
        uploadingImage={uploadingImage}
        uploadError={uploadError}
      />
    );
  }

  // Main Setup View
  return (
    <div style={getCurrentBackground()} className="min-h-screen transition-all duration-300">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-lg font-semibold">Create Canvas</h1>
                <p className="text-sm text-gray-500">Set up your collaborative workspace</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="outline" onClick={() => setShowIconSelector(true)}>
                <span className="text-lg mr-2">{selectedIcon}</span>
                Icons
              </Button>
              <Button variant="outline" onClick={() => setCurrentView('wallpaper')}>
                <Palette className="w-4 h-4 mr-2" />
                Wallpaper
              </Button>
              <Button variant="outline" onClick={() => setShowLayoutModal(true)}>
                <LayoutGrid className="w-4 h-4 mr-2" />
                Layout
              </Button>
              <Button variant="outline" onClick={() => setShowSettingsPanel(true)}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <Button onClick={handleSaveCanvas} disabled={loading || !user}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  `Create Canvas${!user ? ' (Login Required)' : ''}`
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="backdrop-blur-sm bg-white/90">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span className="text-xl">{selectedIcon}</span>
                  Preview - {selectedLayoutInfo?.name} Layout
                </CardTitle>
                <p className="text-sm text-gray-500 mt-1">
                  {title} • {description}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg bg-gray-50/50 min-h-[600px] overflow-auto">
              {renderPreview()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <LayoutSelectionModal
        isOpen={showLayoutModal}
        onClose={() => setShowLayoutModal(false)}
        selectedLayout={layout}
        onSelect={handleLayoutSelect}
        onPreview={handleLayoutPreview}
      />

      <IconSelector
        isOpen={showIconSelector}
        onClose={() => setShowIconSelector(false)}
        selectedIcon={selectedIcon}
        onSelect={setSelectedIcon}
      />

      <SettingsPanel />

      <PreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        previewLayout={previewLayout}
        layoutOptions={layoutOptions}
      >
        {previewLayout && (
          <div style={getCurrentBackground()} className="h-full">
            {renderPreview()}
          </div>
        )}
      </PreviewModal>
    </div>
  );
};

export default CanvasSetupPage;