'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Layers } from 'lucide-react';
import PostPreviewCard from '@/components/collabboard/PostPreviewCard';
import { samplePadlets } from '../sampleData';
import type { LayoutPreviewProps } from '../types';

const WallLayoutPreview: React.FC<LayoutPreviewProps> = ({ isOpen, onClose, onSelect }) => {
  const handleSelect = () => {
    onSelect('wall');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Wall Layout - Masonry Style
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4 bg-gradient-to-br from-blue-50 to-purple-50">
          <div className="relative w-full" style={{ minHeight: '500px' }}>
            {/* Masonry-style layout with staggered positioning */}
            <div className="absolute top-4 left-4 w-48 h-32 bg-white rounded-lg shadow-md p-4 border transform hover:scale-105 transition-transform">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[0].title}</h4>
              <PostPreviewCard padlet={samplePadlets[0] as any} />
            </div>

            <div className="absolute top-4 left-56 w-48 h-40 bg-white rounded-lg shadow-md p-4 border transform hover:scale-105 transition-transform">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[1].title}</h4>
              <PostPreviewCard padlet={samplePadlets[1] as any} />
            </div>

            <div className="absolute top-4 left-[28rem] w-48 h-28 bg-white rounded-lg shadow-md p-4 border transform hover:scale-105 transition-transform">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[2].title}</h4>
              <PostPreviewCard padlet={samplePadlets[2] as any} />
            </div>

            <div className="absolute top-40 left-4 w-48 h-36 bg-white rounded-lg shadow-md p-4 border transform hover:scale-105 transition-transform">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[3].title}</h4>
              <PostPreviewCard padlet={samplePadlets[3] as any} />
            </div>

            <div className="absolute top-48 left-56 w-48 h-32 bg-white rounded-lg shadow-md p-4 border transform hover:scale-105 transition-transform">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[4].title}</h4>
              <PostPreviewCard padlet={samplePadlets[4] as any} />
            </div>

            <div className="absolute top-36 left-[28rem] w-48 h-44 bg-white rounded-lg shadow-md p-4 border transform hover:scale-105 transition-transform">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[5].title}</h4>
              <PostPreviewCard padlet={samplePadlets[5] as any} />
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">
            Brick-like masonry layout with varying heights, perfect for mixed content types
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleSelect}>Select Wall Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WallLayoutPreview;