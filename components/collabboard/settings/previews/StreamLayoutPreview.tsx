'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, AlignJustify, Heart, MessageCircle, Share } from 'lucide-react';
import PostPreviewCard from '@/components/collabboard/PostPreviewCard';
import { samplePadlets } from '../sampleData';
import type { LayoutPreviewProps } from '../types';

const StreamLayoutPreview: React.FC<LayoutPreviewProps> = ({ isOpen, onClose, onSelect }) => {
  const handleSelect = () => {
    onSelect('stream');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <AlignJustify className="w-5 h-5" />
            Stream Layout - Vertical Feed
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4 bg-gradient-to-br from-indigo-50 to-blue-50">
          <div className="max-w-2xl mx-auto space-y-4">
            {samplePadlets.map((padlet, index) => (
              <div key={padlet.id} className="bg-white rounded-lg shadow-md p-6 border hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-semibold text-lg">{padlet.title}</h4>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{padlet.date}</span>
                </div>
                <PostPreviewCard padlet={padlet as any} className="mb-4" />

                {/* Social actions */}
                <div className="flex items-center gap-6 text-xs text-gray-500 pt-3 border-t">
                  <button className="flex items-center gap-1 hover:text-red-600 transition-colors">
                    <Heart className="w-4 h-4" />
                    <span>{12 + index * 3}</span>
                  </button>
                  <button className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                    <MessageCircle className="w-4 h-4" />
                    <span>{5 + index}</span>
                  </button>
                  <button className="flex items-center gap-1 hover:text-green-600 transition-colors">
                    <Share className="w-4 h-4" />
                    Share
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">
            Vertical feed like social media posts - great for announcements and updates
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleSelect}>Select Stream Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StreamLayoutPreview;