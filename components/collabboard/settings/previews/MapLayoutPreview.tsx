'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Map, MapPin } from 'lucide-react';
import { samplePadlets } from '../sampleData';
import type { LayoutPreviewProps } from '../types';

const MapLayoutPreview: React.FC<LayoutPreviewProps> = ({ isOpen, onClose, onSelect }) => {
  const handleSelect = () => {
    onSelect('map');
    onClose();
  };

  const pinColors = ['text-red-500', 'text-blue-500', 'text-green-500', 'text-purple-500', 'text-orange-500'];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <Map className="w-5 h-5" />
            Map Layout - Geographic View
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto p-4 bg-gradient-to-br from-emerald-50 to-teal-50">
          <div className="relative w-full h-96 bg-green-100 rounded-lg overflow-hidden border-2 border-green-200">
            {/* Map background with subtle pattern */}
            <div className="absolute inset-0 bg-gradient-to-br from-green-200 to-blue-200 opacity-50"></div>
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDAsIDAsIDAsIDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20"></div>
            
            {/* Map pins with content */}
            <div className="absolute top-16 left-20">
              <div className="flex flex-col items-center group">
                <MapPin className={`w-6 h-6 ${pinColors[0]} mb-2 drop-shadow-lg group-hover:scale-110 transition-transform`} />
                <div className="bg-white rounded-lg shadow-md p-3 border max-w-40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <h4 className="font-semibold text-xs mb-1">{samplePadlets[0].title}</h4>
                  <p className="text-xs text-gray-600">{samplePadlets[0].location}</p>
                </div>
              </div>
            </div>
            
            <div className="absolute top-32 right-24">
              <div className="flex flex-col items-center group">
                <MapPin className={`w-6 h-6 ${pinColors[1]} mb-2 drop-shadow-lg group-hover:scale-110 transition-transform`} />
                <div className="bg-white rounded-lg shadow-md p-3 border max-w-40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <h4 className="font-semibold text-xs mb-1">{samplePadlets[1].title}</h4>
                  <p className="text-xs text-gray-600">{samplePadlets[1].location}</p>
                </div>
              </div>
            </div>
            
            <div className="absolute bottom-20 left-1/3">
              <div className="flex flex-col items-center group">
                <MapPin className={`w-6 h-6 ${pinColors[2]} mb-2 drop-shadow-lg group-hover:scale-110 transition-transform`} />
                <div className="bg-white rounded-lg shadow-md p-3 border max-w-40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <h4 className="font-semibold text-xs mb-1">{samplePadlets[2].title}</h4>
                  <p className="text-xs text-gray-600">{samplePadlets[2].location}</p>
                </div>
              </div>
            </div>
            
            <div className="absolute top-24 left-1/2">
              <div className="flex flex-col items-center group">
                <MapPin className={`w-6 h-6 ${pinColors[3]} mb-2 drop-shadow-lg group-hover:scale-110 transition-transform`} />
                <div className="bg-white rounded-lg shadow-md p-3 border max-w-40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <h4 className="font-semibold text-xs mb-1">{samplePadlets[3].title}</h4>
                  <p className="text-xs text-gray-600">{samplePadlets[3].location}</p>
                </div>
              </div>
            </div>
            
            <div className="absolute bottom-16 right-20">
              <div className="flex flex-col items-center group">
                <MapPin className={`w-6 h-6 ${pinColors[4]} mb-2 drop-shadow-lg group-hover:scale-110 transition-transform`} />
                <div className="bg-white rounded-lg shadow-md p-3 border max-w-40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <h4 className="font-semibold text-xs mb-1">{samplePadlets[4].title}</h4>
                  <p className="text-xs text-gray-600">{samplePadlets[4].location}</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">Hover over pins to see content details</p>
          </div>
        </div>
        
        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">
            Content positioned on a geographic or spatial map - ideal for location-based information
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handleSelect}>Select Map Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MapLayoutPreview;