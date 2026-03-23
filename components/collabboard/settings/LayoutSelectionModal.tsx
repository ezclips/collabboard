'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { layoutOptions } from '../canvas/LayoutComponents';
import type { LayoutSelectionModalProps, LayoutType } from './types';

// Import all preview components
import WallLayoutPreview from './previews/WallLayoutPreview';
import ColumnsLayoutPreview from './previews/ColumnsLayoutPreview';
import GridLayoutPreview from './previews/GridLayoutPreview';
import TableLayoutPreview from './previews/TableLayoutPreview';
import TimelineLayoutPreview from './previews/TimelineLayoutPreview';
import StreamLayoutPreview from './previews/StreamLayoutPreview';
import FreeformLayoutPreview from './previews/FreeformLayoutPreview';
import MapLayoutPreview from './previews/MapLayoutPreview';
import KanbanLayoutPreview from './previews/KanbanLayoutPreview';

const LayoutSelectionModal: React.FC<LayoutSelectionModalProps> = ({
  isOpen,
  onClose,
  selectedLayout,
  onSelect
}) => {
  const [previewModalType, setPreviewModalType] = useState<LayoutType | null>(null);

  const handleLayoutPreview = (layoutId: LayoutType) => {
    setPreviewModalType(layoutId);
  };

  const handlePreviewClose = () => {
    setPreviewModalType(null);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between">
            <div>
              <DialogTitle>Choose a format</DialogTitle>
              <DialogDescription className="mt-2">
                Select the layout that best fits your content organization needs.
              </DialogDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 p-4">
            {layoutOptions.map((option) => {
              const IconComponent = option.icon;
              const isSelected = selectedLayout === option.id;

              return (
                <div
                  key={option.id}
                  className={`border rounded-lg p-6 space-y-4 transition-all ${isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
                >
                  <div className="flex items-center justify-center text-6xl mb-4">
                    <IconComponent size={60} className={isSelected ? 'text-blue-600' : 'text-gray-600'} />
                  </div>

                  <div className="text-center">
                    <h3 className="font-semibold text-lg mb-2">{option.name}</h3>
                    <p className="text-sm text-gray-600 mb-4">{option.description}</p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant={isSelected ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => onSelect(option.id)}
                    >
                      {isSelected ? 'Selected' : 'Select'}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleLayoutPreview(option.id)}
                    >
                      Preview
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Modals */}
      <WallLayoutPreview
        isOpen={previewModalType === 'wall'}
        onClose={handlePreviewClose}
        onSelect={onSelect}
      />
      <ColumnsLayoutPreview
        isOpen={previewModalType === 'columns'}
        onClose={handlePreviewClose}
        onSelect={onSelect}
      />
      <GridLayoutPreview
        isOpen={previewModalType === 'grid'}
        onClose={handlePreviewClose}
        onSelect={onSelect}
      />
      <TableLayoutPreview
        isOpen={previewModalType === 'table'}
        onClose={handlePreviewClose}
        onSelect={onSelect}
      />
      <TimelineLayoutPreview
        isOpen={previewModalType === 'timeline'}
        onClose={handlePreviewClose}
        onSelect={onSelect}
      />
      <StreamLayoutPreview
        isOpen={previewModalType === 'stream'}
        onClose={handlePreviewClose}
        onSelect={onSelect}
      />
      <FreeformLayoutPreview
        isOpen={previewModalType === 'freeform'}
        onClose={handlePreviewClose}
        onSelect={onSelect}
      />
      <MapLayoutPreview
        isOpen={previewModalType === 'map'}
        onClose={handlePreviewClose}
        onSelect={onSelect}
      />
      <KanbanLayoutPreview
        isOpen={previewModalType === 'kanban'}
        onClose={handlePreviewClose}
        onSelect={onSelect}
      />
    </>
  );
};

export default LayoutSelectionModal;