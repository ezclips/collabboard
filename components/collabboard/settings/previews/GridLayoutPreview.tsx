'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Grid3X3 } from 'lucide-react';
import PostPreviewCard from '@/components/collabboard/PostPreviewCard';
import { samplePadlets } from '../sampleData';
import type { LayoutPreviewProps } from '../types';

const GridLayoutPreview: React.FC<LayoutPreviewProps> = ({ isOpen, onClose, onSelect }) => {
  const handleSelect = () => {
    onSelect('grid');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <Grid3X3 className="w-5 h-5" />
            Grid Layout - Structured Grid
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4 bg-gradient-to-br from-green-50 to-blue-50">
          <div className="grid grid-cols-3 gap-4">
            {samplePadlets.map((padlet) => (
              <div key={padlet.id} className="bg-white rounded-lg shadow-md p-4 border h-36 hover:shadow-lg transition-shadow">
                <h4 className="font-semibold text-sm mb-2">{padlet.title}</h4>
                <PostPreviewCard padlet={padlet as any} />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">
            Equal-sized cards arranged in a structured grid - ideal for galleries and portfolios
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleSelect}>Select Grid Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GridLayoutPreview;