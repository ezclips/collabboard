'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Table, MoreVertical } from 'lucide-react';
import PostPreviewCard from '@/components/collabboard/PostPreviewCard';
import { samplePadlets } from '../sampleData';
import type { LayoutPreviewProps } from '../types';

const TableLayoutPreview: React.FC<LayoutPreviewProps> = ({ isOpen, onClose, onSelect }) => {
  const handleSelect = () => {
    onSelect('table');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <Table className="w-5 h-5" />
            Table Layout - Tabular Data
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4 bg-gradient-to-br from-yellow-50 to-orange-50">
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="grid grid-cols-4 bg-gray-50 border-b">
              <div className="p-3 font-semibold text-sm border-r">Title</div>
              <div className="p-3 font-semibold text-sm border-r">Content</div>
              <div className="p-3 font-semibold text-sm border-r">Date</div>
              <div className="p-3 font-semibold text-sm">Actions</div>
            </div>
            {samplePadlets.slice(0, 4).map((padlet) => (
              <div key={padlet.id} className="grid grid-cols-4 border-b hover:bg-gray-50 transition-colors">
                <div className="p-3 text-sm border-r font-medium">{padlet.title}</div>
                <div className="p-3 text-sm border-r text-gray-600 truncate">
                  <PostPreviewCard padlet={padlet as any} />
                </div>
                <div className="p-3 text-sm border-r text-gray-500">{padlet.date}</div>
                <div className="p-3 text-sm">
                  <Button size="sm" variant="ghost" className="hover:bg-gray-100">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">
            Organized data in rows and columns like a spreadsheet - great for structured information
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleSelect}>Select Table Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TableLayoutPreview;