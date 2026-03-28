'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Upload, Loader2, Link, Image, Grid3X3 } from 'lucide-react';
import type { WallpaperSelectorProps } from '../settings/types';
import ImportsDialog from '@/components/collabboard/imports/ImportsDialog';
import { toast } from 'sonner';
import type { ImportProvider, ResolvedImportItem } from '@/lib/imports/types';

const WallpaperSelector: React.FC<WallpaperSelectorProps> = ({ 
  isOpen, 
  onClose, 
  currentSelection, 
  onSelect 
}) => {
  const [activeTab, setActiveTab] = useState('solid');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [importProviderOpen, setImportProviderOpen] = useState<ImportProvider | null>(null);

  const solidColors = [
    '#ffffff', '#f3f4f6', '#d1d5db', '#374151', '#1f2937', '#000000',
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
    '#ec4899', '#f59e0b', '#84cc16', '#06b6d4', '#6366f1', '#a855f7'
  ];

  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)'
  ];

  const photos = [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=400&h=300&fit=crop'
  ];

  const textures = [
    'https://images.unsplash.com/photo-1553356084-58ef4a67b2a7?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1557683316-973673baf926?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1511300636408-a63a89df3482?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1567095761054-7a02e69e5c43?w=400&h=300&fit=crop'
  ];

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
      setUploadingImage(true);
      
      // Simulate upload process
      setTimeout(() => {
        const fakeUrl = URL.createObjectURL(file);
        onSelect('image', fakeUrl);
        setUploadingImage(false);
      }, 2000);
    }
  };

  const handleLinkSubmit = () => {
    if (linkUrl.trim()) {
      onSelect('image', linkUrl.trim());
      setLinkUrl('');
      setLinkDialogOpen(false);
    }
  };

  const getBackgroundStyle = () => {
    switch (currentSelection.type) {
      case 'color': 
        return { backgroundColor: currentSelection.value };
      case 'gradient': 
        return { background: currentSelection.value };
      case 'image': 
        return { 
          backgroundImage: `url("${currentSelection.value}")`, 
          backgroundSize: 'cover', 
          backgroundPosition: 'center' 
        };
      default: 
        return { backgroundColor: '#22c55e' };
    }
  };

  const wallpaperTabs = [
    { 
      id: 'solid', 
      label: 'Solid Color', 
      icon: <div className="w-4 h-4 rounded-full bg-purple-500"/> 
    },
    { 
      id: 'gradients', 
      label: 'Gradients', 
      icon: <div className="w-4 h-4 rounded bg-gradient-to-r from-pink-500 to-blue-500"/> 
    },
    { 
      id: 'photos', 
      label: 'Photos', 
      icon: <Image className="w-4 h-4"/> 
    },
    { 
      id: 'textures', 
      label: 'Textures', 
      icon: <Grid3X3 className="w-4 h-4"/> 
    },
  ];

  const handleImportedWallpaper = (resolved: ResolvedImportItem) => {
    if (resolved.kind !== 'image') {
      toast.error('Only image files can be used as a board background');
      return;
    }

    onSelect('image', resolved.previewImageUrl);
    setImportProviderOpen(null);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between">
            <div className="w-9" />
            <DialogTitle className="flex-1 text-center">Wallpaper</DialogTitle>
            <div className="w-9" />
          </DialogHeader>

          {/* Current wallpaper preview */}
          <div className="flex justify-center mb-6">
            <div 
              className="w-24 h-16 rounded-lg border-2 border-green-500 shadow-md" 
              style={getBackgroundStyle()} 
            />
          </div>

          {/* Tab navigation */}
          <div className="flex flex-wrap gap-2 mb-4 justify-center">
            {wallpaperTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 rounded-full text-sm flex items-center gap-2 transition-colors ${
                  activeTab === tab.id ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => setActiveTab('upload')}>
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => setImportProviderOpen('google-drive')}>
              <svg className="w-4 h-4 mr-2" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 52H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="M43.65 25L29.9 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 47.5A9 9 0 000 52h27.5z" fill="#00ac47"/>
                <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.65 9.2z" fill="#ea4335"/>
                <path d="M43.65 25L57.4 0H29.9z" fill="#00832d"/>
                <path d="M59.8 52h27.5L73.55 28c-.8-1.4-1.95-2.5-3.3-3.3L57.4 0 43.65 25z" fill="#2684fc"/>
                <path d="M27.5 52L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2L59.8 52z" fill="#ffba00"/>
              </svg>
              Google Drive
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => setImportProviderOpen('microsoft-onedrive')}>
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M10.5 18.5v-13l3 1.5v10z" fill="#0364B8"/>
                <path d="M14.5 7 20 10v7l-5.5-3.5z" fill="#0078D4"/>
                <path d="M4 10l6.5-3 3 1.5L7 12z" fill="#1490DF"/>
                <path d="M4 10v7l6.5 1.5V11.5z" fill="#28A8E8"/>
              </svg>
              OneDrive
            </Button>
          </div>

          {/* Content based on active tab */}
          {activeTab === 'solid' && (
            <div className="grid grid-cols-6 gap-3">
              {solidColors.map(color => (
                <button
                  key={color}
                  onClick={() => onSelect('color', color)}
                  style={{ backgroundColor: color }}
                  className={`w-full aspect-square rounded-lg border-2 flex items-center justify-center transition-transform ${
                    currentSelection.value === color ? 'border-purple-500 scale-110' : 'border-gray-200 hover:scale-105'
                  }`}
                >
                  {currentSelection.value === color && <Check className="w-4 h-4 text-white mix-blend-difference" />}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'gradients' && (
            <div className="grid grid-cols-3 gap-3">
              {gradients.map((gradient, index) => (
                <button
                  key={index}
                  onClick={() => onSelect('gradient', gradient)}
                  style={{ background: gradient }}
                  className={`w-full aspect-video rounded-lg border-2 flex items-center justify-center transition-transform ${
                    currentSelection.value === gradient ? 'border-purple-500 scale-105' : 'border-gray-200 hover:scale-105'
                  }`}
                >
                  {currentSelection.value === gradient && <Check className="w-5 h-5 text-white mix-blend-difference" />}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'photos' && (
            <div className="grid grid-cols-2 gap-3">
              {photos.map((url, index) => (
                <button
                  key={index}
                  onClick={() => onSelect('image', url)}
                  className={`w-full aspect-video rounded-lg border-2 overflow-hidden transition-transform relative ${
                    currentSelection.value === url ? 'border-purple-500 scale-105' : 'border-gray-200 hover:scale-105'
                  }`}
                >
                  <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                  {currentSelection.value === url && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'textures' && (
            <div className="grid grid-cols-2 gap-3">
              {textures.map((url, index) => (
                <button
                  key={index}
                  onClick={() => onSelect('image', url)}
                  className={`w-full aspect-video rounded-lg border-2 overflow-hidden transition-transform relative ${
                    currentSelection.value === url ? 'border-purple-500 scale-105' : 'border-gray-200 hover:scale-105'
                  }`}
                >
                  <img src={url} alt={`Texture ${index + 1}`} className="w-full h-full object-cover" />
                  {currentSelection.value === url && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="space-y-4">
              <label 
                htmlFor="file-upload" 
                className="cursor-pointer block border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors p-6 text-center"
              >
                <h3 className="text-sm font-medium text-gray-900 mb-2">Upload Custom Image</h3>
                <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mb-4">
                  <span>{selectedFileName ? 'Selected:' : 'Choose file'}</span>
                  <span className="text-gray-400 truncate max-w-[150px]">{selectedFileName || 'No file selected'}</span>
                </div>
                <input 
                  id="file-upload" 
                  type="file" 
                  className="sr-only" 
                  accept="image/*" 
                  onChange={handleFileChange} 
                  disabled={uploadingImage} 
                />
                {uploadingImage && (
                  <div className="mt-2 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Uploading...</span>
                  </div>
                )}
              </label>
              
              <Button variant="outline" className="w-full" onClick={() => setLinkDialogOpen(true)}>
                <Link className="w-4 h-4 mr-2" /> Add Image from Link
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Link upload dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter image link</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input 
              value={linkUrl} 
              onChange={(e) => setLinkUrl(e.target.value)} 
              placeholder="Paste image link here" 
              onKeyDown={(e) => e.key === 'Enter' && handleLinkSubmit()}
            />
            <Button onClick={handleLinkSubmit} disabled={!linkUrl.trim()}>
              Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImportsDialog
        isOpen={importProviderOpen !== null}
        initialProvider={importProviderOpen}
        onClose={() => setImportProviderOpen(null)}
        onImportResolved={handleImportedWallpaper}
      />
    </>
  );
};

export default WallpaperSelector;
