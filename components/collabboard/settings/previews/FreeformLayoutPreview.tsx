'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Palette } from 'lucide-react';
import PostPreviewCard from '@/components/collabboard/PostPreviewCard';
import { samplePadlets } from '../sampleData';
import type { LayoutPreviewProps } from '../types';

const FreeformLayoutPreview: React.FC<LayoutPreviewProps> = ({ isOpen, onClose, onSelect }) => {
  const handleSelect = () => {
    onSelect('freeform');
    onClose();
  };

  const stickyColors = ['bg-yellow-100', 'bg-blue-100', 'bg-green-100', 'bg-purple-100', 'bg-pink-100'];
  const borderColors = ['border-yellow-400', 'border-blue-400', 'border-green-400', 'border-purple-400', 'border-pink-400'];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Freeform Layout - Whiteboard Style
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4 bg-gradient-to-br from-gray-50 to-blue-50 relative">
          <div className="relative w-full h-96">
            {/* Sticky note style cards positioned freely */}
            <div className={`absolute top-8 left-12 w-52 h-32 ${stickyColors[0]} rounded-lg shadow-md p-4 border-l-4 ${borderColors[0]} transform rotate-1 hover:rotate-0 transition-transform cursor-move`}>
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[0].title}</h4>
              <PostPreviewCard padlet={samplePadlets[0] as any} />
            </div>

            <div className={`absolute top-16 right-20 w-48 h-28 ${stickyColors[1]} rounded-lg shadow-md p-4 border-l-4 ${borderColors[1]} transform -rotate-2 hover:rotate-0 transition-transform cursor-move`}>
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[1].title}</h4>
              <PostPreviewCard padlet={samplePadlets[1] as any} />
            </div>

            <div className={`absolute bottom-20 left-20 w-44 h-36 ${stickyColors[2]} rounded-lg shadow-md p-4 border-l-4 ${borderColors[2]} transform rotate-3 hover:rotate-0 transition-transform cursor-move`}>
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[2].title}</h4>
              <PostPreviewCard padlet={samplePadlets[2] as any} />
            </div>

            <div className={`absolute top-32 left-1/2 w-40 h-24 ${stickyColors[3]} rounded-lg shadow-md p-4 border-l-4 ${borderColors[3]} transform -rotate-1 hover:rotate-0 transition-transform cursor-move`}>
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[3].title}</h4>
              <PostPreviewCard padlet={samplePadlets[3] as any} />
            </div>

            <div className={`absolute bottom-12 right-16 w-56 h-32 ${stickyColors[4]} rounded-lg shadow-md p-4 border-l-4 ${borderColors[4]} transform rotate-2 hover:rotate-0 transition-transform cursor-move`}>
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[4].title}</h4>
              <PostPreviewCard padlet={samplePadlets[4] as any} />
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">
            Free positioning like sticky notes on a whiteboard - perfect for brainstorming and mind maps
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleSelect}>Select Freeform Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FreeformLayoutPreview;