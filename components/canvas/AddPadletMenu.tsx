// Complete Fixed AddPadletMenu.tsx with integer position conversion
// Replace your entire AddPadletMenu.tsx with this

'use client';

import React, { useState, useRef, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface AddPadletMenuProps {
  canvasId: string;
  onPadletCreated?: (padlet: any) => void;
  containerRef?: React.RefObject<HTMLElement>;
  layoutManager?: any;
}

export default function AddPadletMenu({
  canvasId,
  onPadletCreated,
  containerRef,
  layoutManager,
}: AddPadletMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClientComponentClient();

  const padletTypes = [
    {
      id: 'text',
      icon: '📝',
      title: 'Text Note',
      description: 'Write thoughts or ideas',
      color: 'bg-blue-100 hover:bg-blue-200'
    },
    {
      id: 'image',
      icon: '🖼️',
      title: 'Image',
      description: 'Upload and caption',
      color: 'bg-green-100 hover:bg-green-200'
    },
    {
      id: 'file',
      icon: '📎',
      title: 'File',
      description: 'Upload document',
      color: 'bg-red-100 hover:bg-red-200'
    },
    {
      id: 'link',
      icon: '🔗',
      title: 'Link',
      description: 'Web URL',
      color: 'bg-purple-100 hover:bg-purple-200'
    },
    {
      id: 'custom',
      icon: '✨',
      title: 'Custom',
      description: 'Blank template',
      color: 'bg-orange-100 hover:bg-orange-200'
    }
  ];

  // Get next position for new padlet
  const getNextPosition = () => {
    if (layoutManager?.calculatePositions) {
      try {
        const positions = layoutManager.calculatePositions(1);
        return positions[0] || { x: 50, y: 50, width: 280, height: 200 };
      } catch (err) {
        console.warn('Layout manager failed, using fallback position');
      }
    }
    
    return {
      x: Math.random() * 300 + 50,
      y: Math.random() * 200 + 50,
      width: 280,
      height: 200
    };
  };

  // Upload file to Supabase Storage
  const uploadFileToStorage = async (file: File): Promise<{
    url: string;
    fileName: string;
    fileSize: number;
    fileType: string;
  }> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

      console.log('📤 Uploading file:', file.name, 'as', fileName);

      const { error: uploadError } = await supabase.storage
        .from('padlet-files')
        .upload(fileName, file, { 
          cacheControl: '3600', 
          upsert: false 
        });

      if (uploadError) {
        console.error('❌ Upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from('padlet-files')
        .getPublicUrl(fileName);

      console.log('✅ File uploaded successfully:', urlData.publicUrl);

      return {
        url: urlData.publicUrl,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      };
    } catch (error) {
      console.error('❌ Upload failed:', error);
      throw error;
    }
  };

  // Create padlet in database with INTEGER position conversion
  const createPadletInDB = async (type: string, title: string, content: string, fileData?: any) => {
    const position = getNextPosition();
    
    const padletData = {
      board_id: canvasId,
      title: title,
      content: content,
      type: type,
      // 🔥 FIX: Convert floating-point positions to integers
      position_x: Math.round(position.x || 0),
      position_y: Math.round(position.y || 0),
      width: Math.round(position.width || 280),
      height: Math.round(position.height || 200),
      
      // Add file data if provided
      ...(fileData && {
        file_url: fileData.url,
        file_name: fileData.fileName,
        file_type: fileData.fileType,
        file_size: Math.round(fileData.fileSize || 0)
      })
    };

    console.log('🎨 Creating padlet with integer positions:', padletData);

    const { data, error } = await supabase
      .from('padlets')
      .insert([padletData])
      .select()
      .single();

    if (error) {
      console.error('❌ Database error:', error);
      throw error;
    }

    console.log('✅ Padlet created successfully:', data);
    return data;
  };

  // Handle file upload (for both drag & drop and file input)
  const handleFileUpload = async (file: File, type: 'image' | 'file') => {
    setIsUploading(true);
    setError(null);
    
    try {
      console.log(`📁 Processing ${type} upload:`, file.name);
      
      // Upload file to storage
      const fileData = await uploadFileToStorage(file);
      
      // Create appropriate title and content based on type
      let title: string;
      let content: string;
      
      if (type === 'image') {
        title = 'Image'; // Simple, clean title
        content = 'Click to add a caption...';
      } else {
        title = 'Document'; // Simple, clean title  
        content = `${file.name}\n${(file.size / 1024).toFixed(1)}KB`;
      }
      
      // Create padlet in database
      const newPadlet = await createPadletInDB(type, title, content, fileData);
      
      // Notify parent component
      if (onPadletCreated) {
        onPadletCreated(newPadlet);
      }
      
      // Close menu
      setIsMenuOpen(false);
      setSelectedType(null);
      
    } catch (err) {
      console.error('❌ File upload failed:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle text/link/custom padlet creation
  const handleCreateTextPadlet = async (type: string) => {
    setIsUploading(true);
    setError(null);
    
    try {
      let title: string;
      let content: string;
      
      switch (type) {
        case 'text':
          title = 'Text Note';
          content = 'Click to edit your text here...';
          break;
        case 'link':
          title = 'Link';
          content = 'https://example.com\n\nPaste your link here';
          break;
        case 'custom':
          title = 'Custom Note';
          content = 'Add your custom content here...';
          break;
        default:
          title = 'Note';
          content = 'Click to edit...';
      }
      
      const newPadlet = await createPadletInDB(type, title, content);
      
      if (onPadletCreated) {
        onPadletCreated(newPadlet);
      }
      
      setIsMenuOpen(false);
      
    } catch (err) {
      console.error('❌ Padlet creation failed:', err);
      setError(err instanceof Error ? err.message : 'Creation failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Drag and drop handlers
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Determine type based on file
    const type = file.type.startsWith('image/') ? 'image' : 'file';
    await handleFileUpload(file, type);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  // File input handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedType) return;
    
    if (selectedType === 'image' || selectedType === 'file') {
      handleFileUpload(file, selectedType);
    }
    
    // Clear input
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />

      {/* Error Display */}
      {error && (
        <div className="px-6 py-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">❌ {error}</p>
        </div>
      )}

      {/* Padlet Type Buttons */}
      <div className="grid gap-2">
        {padletTypes.map((type) => (
          <button
            key={type.id}
            onClick={() => {
              if (type.id === 'image' || type.id === 'file') {
                setSelectedType(type.id);
                const input = fileInputRef.current;
                if (input) {
                  input.accept = type.id === 'image' ? 'image/*' : '*/*';
                  input.click();
                }
              } else {
                handleCreateTextPadlet(type.id);
              }
            }}
            disabled={isUploading}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 disabled:opacity-50 ${type.color}`}
          >
            <span className="text-lg">{type.icon}</span>
            <div className="text-left">
              <div className="font-medium text-gray-900">{type.title}</div>
              <div className="text-sm text-gray-600">{type.description}</div>
            </div>
            {isUploading && selectedType === type.id && (
              <div className="ml-auto w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            )}
          </button>
        ))}
      </div>

      {/* Drag & Drop Zone */}
      <div 
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 ${
          isDraggingOver 
            ? 'border-blue-400 bg-blue-50 text-blue-600' 
            : 'border-gray-300 bg-gray-50 text-gray-500'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="text-2xl mb-2">📁</div>
        <p className="text-sm font-medium">
          {isDraggingOver ? 'Drop your file here!' : 'Or drag & drop files here'}
        </p>
        <p className="text-xs mt-1">Images and documents supported</p>
      </div>

      {/* Loading State */}
      {isUploading && (
        <div className="flex items-center justify-center py-4">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-3" />
          <span className="text-sm text-gray-600">Creating padlet...</span>
        </div>
      )}
    </div>
  );
}