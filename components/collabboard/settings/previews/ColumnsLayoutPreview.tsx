'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Columns } from 'lucide-react';
import PostPreviewCard from '@/components/collabboard/PostPreviewCard';
import { sampleColumns } from '../sampleData';
import type { LayoutPreviewProps } from '../types';

const ColumnsLayoutPreview: React.FC<LayoutPreviewProps> = ({ isOpen, onClose, onSelect }) => {
  const handleSelect = () => {
    onSelect('columns');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <Columns className="w-5 h-5" />
            Columns Layout - Drag & Drop Columns
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-4 bg-gradient-to-br from-green-50 to-blue-50">
          <div className="flex gap-4">
            {sampleColumns.map((column, index) => {
              const bgColors = ['bg-gray-100', 'bg-yellow-100', 'bg-green-100'];
              return (
                <div key={column.id} className={`flex-1 ${bgColors[index]} rounded-lg p-4 min-h-96`}>
                  <h3 className="font-semibold mb-4 text-center">{column.title}</h3>
                  <div className="space-y-3">
                    {column.items.map((item) => (
                      <div key={item.id} className="bg-white rounded-lg shadow-sm p-3 border cursor-move hover:shadow-md transition-shadow">
                        <h4 className="font-medium text-sm">{item.title}</h4>
                        <div className="mt-1">
                          <PostPreviewCard padlet={item as any} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">
            Organize content in draggable columns like Trello - perfect for project management
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleSelect}>Select Columns Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ColumnsLayoutPreview;