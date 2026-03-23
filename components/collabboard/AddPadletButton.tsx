'use client';

import React, { useState, useRef } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  MoreVertical,
  Type,
  Image as ImageIcon,
  FileText,
  Link,
  Wand2,
  Upload,
  X,
  Plus,
} from 'lucide-react';

interface AddPadletButtonProps {
  onAdd: (padletData: any) => void;
  layout: string;
  containerRef: React.RefObject<HTMLDivElement>;
  padletsCount: number;
}

export default function AddPadletButton({
  onAdd,
  layout,
  containerRef,
  padletsCount,
}: AddPadletButtonProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isTextDialogOpen, setIsTextDialogOpen] = useState(false);
  const [isFileDialogOpen, setIsFileDialogOpen] = useState(false);
  
  // Form states
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [imageTitle, setImageTitle] = useState('');
  const [imageContent, setImageContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Smart positioning based on layout
  const getNextPosition = () => {
    const container = containerRef.current;
    const containerWidth = container?.clientWidth || 800;
    
    switch (layout) {
      case 'wall':
        const wallCols = Math.floor(containerWidth / 300);
        const wallCol = padletsCount % wallCols;
        const wallRow = Math.floor(padletsCount / wallCols);
        return {
          x: 20 + (wallCol * 300),
          y: 20 + (wallRow * 250),
        };
      
      case 'grid':
        const gridCols = Math.floor(containerWidth / 300);
        const gridCol = padletsCount % gridCols;
        const gridRow = Math.floor(padletsCount / gridCols);
        return {
          x: 20 + (gridCol * 300),
          y: 20 + (gridRow * 250),
        };
      
      default:
        return {
          x: 50 + ((padletsCount % 3) * 300),
          y: 50 + (Math.floor(padletsCount / 3) * 250),
        };
    }
  };

  // Reset form states
  const resetForms = () => {
    setTextTitle('');
    setTextContent('');
    setImageTitle('');
    setImageContent('');
    setSelectedFile(null);
    setPreviewUrl('');
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    
    if (file.type.startsWith('image/')) {
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setImageTitle(file.name.split('.')[0] || 'Image Post');
    }
  };

  // Save padlets
  const saveTextPadlet = () => {
    const position = getNextPosition();
    
    onAdd({
      title: textTitle || 'Text Note',
      content: textContent,
      position_x: position.x,
      position_y: position.y,
      width: 280,
      height: 200,
    });

    resetForms();
    setIsTextDialogOpen(false);
    setIsPopoverOpen(false);
  };

  const saveImagePadlet = () => {
    if (!selectedFile) return;
    
    const position = getNextPosition();
    const objectUrl = URL.createObjectURL(selectedFile);
    
    onAdd({
      title: imageTitle || 'Image Post',
      content: imageContent,
      position_x: position.x,
      position_y: position.y,
      width: 280,
      height: 350,
      file_url: objectUrl,
      file_name: selectedFile.name,
      file_type: selectedFile.type,
      file_size: selectedFile.size,
    });

    resetForms();
    setIsImageDialogOpen(false);
    setIsPopoverOpen(false);
  };

  const saveFilePadlet = () => {
    if (!selectedFile) return;
    
    const position = getNextPosition();
    const objectUrl = URL.createObjectURL(selectedFile);
    
    onAdd({
      title: selectedFile.name,
      content: `File: ${selectedFile.name}`,
      position_x: position.x,
      position_y: position.y,
      width: 280,
      height: 220,
      file_url: objectUrl,
      file_name: selectedFile.name,
      file_type: selectedFile.type,
      file_size: selectedFile.size,
    });

    resetForms();
    setIsFileDialogOpen(false);
    setIsPopoverOpen(false);
  };

  // Quick add functions
  const handleQuickAdd = (type: string) => {
    const position = getNextPosition();
    
    switch (type) {
      case 'link':
        onAdd({
          title: 'Web Link',
          content: 'https://example.com\n\nPaste your URL here...',
          position_x: position.x,
          position_y: position.y,
          width: 280,
          height: 180,
        });
        break;
      
      case 'custom':
        onAdd({
          title: 'Custom Padlet',
          content: 'Create with custom content...',
          position_x: position.x,
          position_y: position.y,
          width: 300,
          height: 220,
        });
        break;
    }
    
    setIsPopoverOpen(false);
  };

  return (
    <>
      {/* ✅ Modern 3-dot trigger button with Popover */}
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            className="fixed bottom-6 right-6 z-50 rounded-full bg-white border shadow-lg hover:bg-gray-50 transition-all"
            variant="ghost"
            size="lg"
            style={{ 
              width: '56px', 
              height: '56px',
            }}
          >
            <MoreVertical className="h-6 w-6 text-gray-600" />
          </Button>
        </PopoverTrigger>
        
        <PopoverContent 
          align="end" 
          className="w-64 p-0 bg-white border shadow-xl"
          sideOffset={8}
        >
          <div className="p-2">
            <div className="text-sm font-medium text-gray-900 mb-3 px-2">Add to Canvas</div>
            
            {/* Text Note with Dialog */}
            <Dialog open={isTextDialogOpen} onOpenChange={setIsTextDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start px-2 py-3 h-auto"
                  onClick={() => {
                    setTextTitle('');
                    setTextContent('');
                  }}
                >
                  <Type className="h-4 w-4 mr-3" />
                  <div className="text-left">
                    <div className="font-medium">Text Note</div>
                    <div className="text-xs text-gray-500">Write thoughts or ideas</div>
                  </div>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Type className="h-5 w-5" />
                    New Text Note
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Note title..."
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                  />
                  <Textarea
                    placeholder="Write your thoughts here..."
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsTextDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={saveTextPadlet}>
                    Create Note
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Image with Dialog */}
            <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start px-2 py-3 h-auto"
                  onClick={() => {
                    setImageTitle('');
                    setImageContent('');
                    setSelectedFile(null);
                    setPreviewUrl('');
                  }}
                >
                  <ImageIcon className="h-4 w-4 mr-3" />
                  <div className="text-left">
                    <div className="font-medium">Image</div>
                    <div className="text-xs text-gray-500">Upload and caption</div>
                  </div>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    Add Image
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* File Upload Area */}
                  <Card className="border-dashed border-2 border-gray-300 hover:border-gray-400 transition-colors">
                    <CardContent className="p-6 relative">
                      {previewUrl ? (
                        <div className="space-y-3">
                          <div className="relative">
                            <img 
                              src={previewUrl} 
                              alt="Preview" 
                              className="w-full h-32 object-cover rounded resize-none"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white"
                              onClick={() => {
                                setSelectedFile(null);
                                setPreviewUrl('');
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-xs text-gray-500 text-center">
                            {selectedFile?.name}
                          </p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                          <p className="text-sm text-gray-600 mb-2">Click to upload image</p>
                          <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                        </div>
                      )}
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </CardContent>
                  </Card>

                  {/* Title and Caption */}
                  <Input
                    placeholder="Image title..."
                    value={imageTitle}
                    onChange={(e) => setImageTitle(e.target.value)}
                  />
                  <Textarea
                    placeholder="Add a caption or description..."
                    value={imageContent}
                    onChange={(e) => setImageContent(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsImageDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={saveImagePadlet} disabled={!selectedFile}>
                    Add Image
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* File Upload */}
            <Dialog open={isFileDialogOpen} onOpenChange={setIsFileDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start px-2 py-3 h-auto"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl('');
                  }}
                >
                  <FileText className="h-4 w-4 mr-3" />
                  <div className="text-left">
                    <div className="font-medium">File</div>
                    <div className="text-xs text-gray-500">Upload document</div>
                  </div>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Upload File
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Card className="border-dashed border-2 border-gray-300 hover:border-gray-400 transition-colors">
                    <CardContent className="p-6 relative">
                      {selectedFile ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                            <FileText className="h-8 w-8 text-blue-500" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                              <p className="text-xs text-gray-500">
                                {(selectedFile.size / 1024).toFixed(1)}KB
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedFile(null)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                          <p className="text-sm text-gray-600 mb-2">Click to upload file</p>
                          <p className="text-xs text-gray-500">PDF, DOC, TXT, etc.</p>
                        </div>
                      )}
                      <input
                        type="file"
                        onChange={handleFileSelect}
                        accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.ppt,.pptx"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </CardContent>
                  </Card>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsFileDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={saveFilePadlet} disabled={!selectedFile}>
                    Upload File
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Quick Add Options */}
            <div className="border-t pt-2 mt-2">
              <Button
                variant="ghost"
                className="w-full justify-start px-2 py-3 h-auto"
                onClick={() => handleQuickAdd('link')}
              >
                <Link className="h-4 w-4 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Link</div>
                  <div className="text-xs text-gray-500">Web URL</div>
                </div>
              </Button>

              <Button
                variant="ghost"
                className="w-full justify-start px-2 py-3 h-auto"
                onClick={() => handleQuickAdd('custom')}
              >
                <Wand2 className="h-4 w-4 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Custom</div>
                  <div className="text-xs text-gray-500">Blank template</div>
                </div>
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}