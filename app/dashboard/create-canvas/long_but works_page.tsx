"use client"

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  X, ChevronRight, Calendar, Palette, Image, Grid3X3, Upload,
  Check, Layers, Columns, Table, Map, AlignJustify,
  LayoutGrid, ArrowLeft, Link, Loader2, Clock, MapPin,
  MoreVertical
} from 'lucide-react';

// Types
interface WallpaperSelection {
  type: 'color' | 'gradient' | 'image';
  value: string;
}

type LayoutType = 'wall' | 'columns' | 'grid' | 'table' | 'freeform' | 'timeline' | 'stream' | 'map';

// Sample data for previews
const samplePadlets = [
  { id: '1', title: 'Welcome!', content: 'This is your new canvas. Add content and arrange it however you like.', date: '2024-01-15', location: 'Office' },
  { id: '2', title: 'Collaborate', content: 'Invite team members to work together in real-time.', date: '2024-01-16', location: 'Home' },
  { id: '3', title: 'Organize', content: 'Switch between different layouts to organize your content.', date: '2024-01-17', location: 'Cafe' },
  { id: '4', title: 'Customize', content: 'Change colors, wallpapers, and settings to match your style.', date: '2024-01-18', location: 'Park' },
  { id: '5', title: 'Share', content: 'Share your canvas with others or export your work.', date: '2024-01-19', location: 'Library' },
  { id: '6', title: 'Discover', content: 'Explore new features and possibilities.', date: '2024-01-20', location: 'Beach' }
];

// Layout options with modern Lucide icons
const layoutOptions = [
  { id: 'wall' as LayoutType, name: 'Wall', icon: Layers, description: 'Arrange content in a brick-like formation.' },
  { id: 'columns' as LayoutType, name: 'Columns', icon: Columns, description: 'Organize content in columns.' },
  { id: 'grid' as LayoutType, name: 'Grid', icon: Grid3X3, description: 'Arrange content in a grid pattern.' },
  { id: 'table' as LayoutType, name: 'Table', icon: Table, description: 'Organize content in table format.' },
  { id: 'freeform' as LayoutType, name: 'Freeform', icon: Palette, description: 'Position content freely.' },
  { id: 'timeline' as LayoutType, name: 'Timeline', icon: Calendar, description: 'Arrange content along a horizontal line.' },
  { id: 'stream' as LayoutType, name: 'Stream', icon: AlignJustify, description: 'Arrange content in a stream.' },
  { id: 'map' as LayoutType, name: 'Map', icon: Map, description: 'Display content points on a map.' },
];

// MODAL 1: Layout Selection Modal (Choose a format)
const LayoutSelectionModal = ({ isOpen, onClose, selectedLayout, onSelect, onPreview }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Choose a format</DialogTitle>
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
                className={`border rounded-lg p-6 space-y-4 transition-all ${
                  isSelected
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
                    onClick={() => onPreview(option.id)}
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
  );
};

// MODAL 2: Individual Layout Preview Modals
const WallLayoutPreview = ({ isOpen, onClose, onSelect }) => {
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
            <div className="absolute top-4 left-4 w-48 h-32 bg-white rounded-lg shadow-md p-4 border">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[0].title}</h4>
              <p className="text-xs text-gray-600">{samplePadlets[0].content}</p>
            </div>
            <div className="absolute top-4 left-56 w-48 h-40 bg-white rounded-lg shadow-md p-4 border">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[1].title}</h4>
              <p className="text-xs text-gray-600">{samplePadlets[1].content}</p>
            </div>
            <div className="absolute top-4 left-[28rem] w-48 h-28 bg-white rounded-lg shadow-md p-4 border">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[2].title}</h4>
              <p className="text-xs text-gray-600">{samplePadlets[2].content}</p>
            </div>
            <div className="absolute top-40 left-4 w-48 h-36 bg-white rounded-lg shadow-md p-4 border">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[3].title}</h4>
              <p className="text-xs text-gray-600">{samplePadlets[3].content}</p>
            </div>
            <div className="absolute top-48 left-56 w-48 h-32 bg-white rounded-lg shadow-md p-4 border">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[4].title}</h4>
              <p className="text-xs text-gray-600">{samplePadlets[4].content}</p>
            </div>
            <div className="absolute top-36 left-[28rem] w-48 h-44 bg-white rounded-lg shadow-md p-4 border">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[5].title}</h4>
              <p className="text-xs text-gray-600">{samplePadlets[5].content}</p>
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">Brick-like masonry layout with varying heights</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => { onSelect('wall'); onClose(); }}>Select Wall Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ColumnsLayoutPreview = ({ isOpen, onClose, onSelect }) => {
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
            <div className="flex-1 bg-gray-100 rounded-lg p-4 min-h-96">
              <h3 className="font-semibold mb-4 text-center">To Do</h3>
              <div className="space-y-3">
                <div className="bg-white rounded-lg shadow-sm p-3 border">
                  <h4 className="font-medium text-sm">{samplePadlets[0].title}</h4>
                  <p className="text-xs text-gray-600 mt-1">{samplePadlets[0].content}</p>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-3 border">
                  <h4 className="font-medium text-sm">{samplePadlets[1].title}</h4>
                  <p className="text-xs text-gray-600 mt-1">{samplePadlets[1].content}</p>
                </div>
              </div>
            </div>
            
            <div className="flex-1 bg-yellow-100 rounded-lg p-4 min-h-96">
              <h3 className="font-semibold mb-4 text-center">In Progress</h3>
              <div className="space-y-3">
                <div className="bg-white rounded-lg shadow-sm p-3 border">
                  <h4 className="font-medium text-sm">{samplePadlets[2].title}</h4>
                  <p className="text-xs text-gray-600 mt-1">{samplePadlets[2].content}</p>
                </div>
              </div>
            </div>
            
            <div className="flex-1 bg-green-100 rounded-lg p-4 min-h-96">
              <h3 className="font-semibold mb-4 text-center">Done</h3>
              <div className="space-y-3">
                <div className="bg-white rounded-lg shadow-sm p-3 border">
                  <h4 className="font-medium text-sm">{samplePadlets[3].title}</h4>
                  <p className="text-xs text-gray-600 mt-1">{samplePadlets[3].content}</p>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-3 border">
                  <h4 className="font-medium text-sm">{samplePadlets[4].title}</h4>
                  <p className="text-xs text-gray-600 mt-1">{samplePadlets[4].content}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">Organize content in draggable columns like Trello</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => { onSelect('columns'); onClose(); }}>Select Columns Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const GridLayoutPreview = ({ isOpen, onClose, onSelect }) => {
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
              <div key={padlet.id} className="bg-white rounded-lg shadow-md p-4 border h-36">
                <h4 className="font-semibold text-sm mb-2">{padlet.title}</h4>
                <p className="text-xs text-gray-600 line-clamp-3">{padlet.content}</p>
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">Equal-sized cards arranged in a structured grid</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => { onSelect('grid'); onClose(); }}>Select Grid Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const TableLayoutPreview = ({ isOpen, onClose, onSelect }) => {
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
              <div key={padlet.id} className="grid grid-cols-4 border-b hover:bg-gray-50">
                <div className="p-3 text-sm border-r font-medium">{padlet.title}</div>
                <div className="p-3 text-sm border-r text-gray-600 truncate">{padlet.content}</div>
                <div className="p-3 text-sm border-r text-gray-500">{padlet.date}</div>
                <div className="p-3 text-sm">
                  <Button size="sm" variant="ghost">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">Organized data in rows and columns like a spreadsheet</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => { onSelect('table'); onClose(); }}>Select Table Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const TimelineLayoutPreview = ({ isOpen, onClose, onSelect }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Timeline Layout - Chronological Flow
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto p-4 bg-gradient-to-br from-purple-50 to-pink-50">
          <div className="relative">
            <div className="absolute top-16 left-0 right-0 h-0.5 bg-purple-300"></div>
            
            <div className="flex justify-between items-start pt-4">
              {samplePadlets.slice(0, 4).map((padlet) => (
                <div key={padlet.id} className="flex flex-col items-center max-w-48">
                  <div className="w-4 h-4 bg-purple-500 rounded-full mb-4 relative z-10"></div>
                  <div className="bg-white rounded-lg shadow-md p-4 border">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500">{padlet.date}</span>
                    </div>
                    <h4 className="font-semibold text-sm mb-2">{padlet.title}</h4>
                    <p className="text-xs text-gray-600 line-clamp-2">{padlet.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">Events arranged chronologically along a timeline</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => { onSelect('timeline'); onClose(); }}>Select Timeline Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const StreamLayoutPreview = ({ isOpen, onClose, onSelect }) => {
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
            {samplePadlets.map((padlet) => (
              <div key={padlet.id} className="bg-white rounded-lg shadow-md p-6 border">
                <div className="flex items-start justify-between mb-3">
                  <h4 className="font-semibold text-lg">{padlet.title}</h4>
                  <span className="text-xs text-gray-500">{padlet.date}</span>
                </div>
                <p className="text-gray-600 mb-4">{padlet.content}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <button className="hover:text-blue-600">Like</button>
                  <button className="hover:text-blue-600">Comment</button>
                  <button className="hover:text-blue-600">Share</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">Vertical feed like social media posts</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => { onSelect('stream'); onClose(); }}>Select Stream Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const FreeformLayoutPreview = ({ isOpen, onClose, onSelect }) => {
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
            <div className="absolute top-8 left-12 w-52 h-32 bg-yellow-100 rounded-lg shadow-md p-4 border-l-4 border-yellow-400 transform rotate-1">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[0].title}</h4>
              <p className="text-xs text-gray-700">{samplePadlets[0].content}</p>
            </div>
            <div className="absolute top-16 right-20 w-48 h-28 bg-blue-100 rounded-lg shadow-md p-4 border-l-4 border-blue-400 transform -rotate-2">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[1].title}</h4>
              <p className="text-xs text-gray-700">{samplePadlets[1].content}</p>
            </div>
            <div className="absolute bottom-20 left-20 w-44 h-36 bg-green-100 rounded-lg shadow-md p-4 border-l-4 border-green-400 transform rotate-3">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[2].title}</h4>
              <p className="text-xs text-gray-700">{samplePadlets[2].content}</p>
            </div>
            <div className="absolute top-32 left-1/2 w-40 h-24 bg-purple-100 rounded-lg shadow-md p-4 border-l-4 border-purple-400 transform -rotate-1">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[3].title}</h4>
              <p className="text-xs text-gray-700">{samplePadlets[3].content}</p>
            </div>
            <div className="absolute bottom-12 right-16 w-56 h-32 bg-pink-100 rounded-lg shadow-md p-4 border-l-4 border-pink-400 transform rotate-2">
              <h4 className="font-semibold text-sm mb-2">{samplePadlets[4].title}</h4>
              <p className="text-xs text-gray-700">{samplePadlets[4].content}</p>
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">Free positioning like sticky notes on a whiteboard</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => { onSelect('freeform'); onClose(); }}>Select Freeform Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const MapLayoutPreview = ({ isOpen, onClose, onSelect }) => {
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
          <div className="relative w-full h-96 bg-green-100 rounded-lg overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-green-200 to-blue-200 opacity-50"></div>
            
            <div className="absolute top-16 left-20">
              <div className="flex flex-col items-center">
                <MapPin className="w-6 h-6 text-red-500 mb-2" />
                <div className="bg-white rounded-lg shadow-md p-3 border max-w-40">
                  <h4 className="font-semibold text-xs mb-1">{samplePadlets[0].title}</h4>
                  <p className="text-xs text-gray-600">{samplePadlets[0].location}</p>
                </div>
              </div>
            </div>
            
            <div className="absolute top-32 right-24">
              <div className="flex flex-col items-center">
                <MapPin className="w-6 h-6 text-blue-500 mb-2" />
                <div className="bg-white rounded-lg shadow-md p-3 border max-w-40">
                  <h4 className="font-semibold text-xs mb-1">{samplePadlets[1].title}</h4>
                  <p className="text-xs text-gray-600">{samplePadlets[1].location}</p>
                </div>
              </div>
            </div>
            
            <div className="absolute bottom-20 left-1/3">
              <div className="flex flex-col items-center">
                <MapPin className="w-6 h-6 text-green-500 mb-2" />
                <div className="bg-white rounded-lg shadow-md p-3 border max-w-40">
                  <h4 className="font-semibold text-xs mb-1">{samplePadlets[2].title}</h4>
                  <p className="text-xs text-gray-600">{samplePadlets[2].location}</p>
                </div>
              </div>
            </div>
            
            <div className="absolute top-24 left-1/2">
              <div className="flex flex-col items-center">
                <MapPin className="w-6 h-6 text-purple-500 mb-2" />
                <div className="bg-white rounded-lg shadow-md p-3 border max-w-40">
                  <h4 className="font-semibold text-xs mb-1">{samplePadlets[3].title}</h4>
                  <p className="text-xs text-gray-600">{samplePadlets[3].location}</p>
                </div>
              </div>
            </div>
            
            <div className="absolute bottom-16 right-20">
              <div className="flex flex-col items-center">
                <MapPin className="w-6 h-6 text-orange-500 mb-2" />
                <div className="bg-white rounded-lg shadow-md p-3 border max-w-40">
                  <h4 className="font-semibold text-xs mb-1">{samplePadlets[4].title}</h4>
                  <p className="text-xs text-gray-600">{samplePadlets[4].location}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center p-4 border-t">
          <p className="text-sm text-gray-600">Content positioned on a geographic or spatial map</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => { onSelect('map'); onClose(); }}>Select Map Layout</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Wallpaper Selector Component
const WallpaperSelector = ({ isOpen, onClose, currentSelection, onSelect }) => {
  const [activeTab, setActiveTab] = useState('solid');
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('');

  const solidColors = [
    '#ffffff', '#f3f4f6', '#d1d5db', '#374151', '#1f2937', '#000000',
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6',
    '#ec4899', '#f59e0b', '#84cc16', '#06b6d4', '#6366f1', '#a855f7'
  ];

  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)'
  ];

  const photos = [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=300&fit=crop',
    'https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=400&h=300&fit=crop'
  ];

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
      setUploadingImage(true);
      setTimeout(() => {
        const fakeUrl = URL.createObjectURL(file);
        onSelect('image', fakeUrl);
        setUploadingImage(false);
      }, 2000);
    }
  };

  const handleLinkSubmit = () => {
    if (linkUrl.trim()) {
      onSelect('image', linkUrl.trim());
      setLinkUrl('');
      setLinkDialogOpen(false);
    }
  };

  const getBackgroundStyle = () => {
    switch (currentSelection.type) {
      case 'color': return { backgroundColor: currentSelection.value };
      case 'gradient': return { background: currentSelection.value };
      case 'image': return { backgroundImage: `url("${currentSelection.value}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
      default: return { backgroundColor: '#22c55e' };
    }
  };

  const wallpaperTabs = [
    { id: 'solid', label: 'Solid Color', icon: <div className="w-4 h-4 rounded-full bg-purple-500"/> },
    { id: 'gradients', label: 'Gradients', icon: <div className="w-4 h-4 rounded bg-gradient-to-r from-pink-500 to-blue-500"/> },
    { id: 'photos', label: 'Photos', icon: <Image className="w-4 h-4"/> },
    { id: 'upload', label: 'Upload', icon: <Upload className="w-4 h-4"/> }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <DialogTitle className="flex-1 text-center">Wallpaper</DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>

        <div className="flex justify-center mb-6">
          <div className="w-24 h-16 rounded-lg border-2 border-green-500" style={getBackgroundStyle()} />
        </div>

        <div className="flex flex-wrap gap-2 mb-6 justify-center">
          {wallpaperTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 rounded-full text-sm flex items-center gap-2 transition-colors ${
                activeTab === tab.id ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'solid' && (
          <div className="grid grid-cols-6 gap-3">
            {solidColors.map(color => (
              <button
                key={color}
                onClick={() => onSelect('color', color)}
                style={{ backgroundColor: color }}
                className={`w-full aspect-square rounded-lg border-2 flex items-center justify-center transition-transform ${
                  currentSelection.value === color ? 'border-purple-500 scale-110' : 'border-gray-200 hover:scale-105'
                }`}
              >
                {currentSelection.value === color && <Check className="w-4 h-4 text-white mix-blend-difference" />}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'gradients' && (
          <div className="grid grid-cols-3 gap-3">
            {gradients.map((gradient, index) => (
              <button
                key={index}
                onClick={() => onSelect('gradient', gradient)}
                style={{ background: gradient }}
                className={`w-full aspect-video rounded-lg border-2 flex items-center justify-center transition-transform ${
                  currentSelection.value === gradient ? 'border-purple-500 scale-105' : 'border-gray-200 hover:scale-105'
                }`}
              >
                {currentSelection.value === gradient && <Check className="w-5 h-5 text-white mix-blend-difference" />}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'photos' && (
          <div className="grid grid-cols-2 gap-3">
            {photos.map((url, index) => (
              <button
                key={index}
                onClick={() => onSelect('image', url)}
                className={`w-full aspect-video rounded-lg border-2 overflow-hidden transition-transform relative ${
                  currentSelection.value === url ? 'border-purple-500 scale-105' : 'border-gray-200 hover:scale-105'
                }`}
              >
                <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                {currentSelection.value === url && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="space-y-4">
            <label htmlFor="file-upload" className="cursor-pointer block border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors p-6 text-center">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Upload Custom Image</h3>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mb-4">
                <span>{selectedFileName ? 'Selected:' : 'Choose file'}</span>
                <span className="text-gray-400 truncate max-w-[150px]">{selectedFileName || 'No file selected'}</span>
              </div>
              <input id="file-upload" type="file" className="sr-only" accept="image/*" onChange={handleFileChange} disabled={uploadingImage} />
              {uploadingImage && (
                <div className="mt-2 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span>Uploading...</span>
                </div>
              )}
            </label>
            <Button variant="outline" className="w-full" onClick={() => setLinkDialogOpen(true)}>
              <Link className="w-4 h-4 mr-2" /> Add Image from Link
            </Button>
          </div>
        )}

        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enter image link</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2">
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Paste image link here" />
              <Button onClick={handleLinkSubmit} disabled={!linkUrl.trim()}>Submit</Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

// Main Settings Panel Component
const SettingsPanel = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [wallpaperModalOpen, setWallpaperModalOpen] = useState(false);
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  const [previewModalType, setPreviewModalType] = useState(null);
  
  // Settings state
  const [title, setTitle] = useState('Timeline');
  const [description, setDescription] = useState('Scroll to view');
  const [selectedLayout, setSelectedLayout] = useState('timeline');
  const [wallpaper, setWallpaper] = useState({ 
    type: 'image', 
    value: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop' 
  });
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  const [newPostsAtTop, setNewPostsAtTop] = useState(true);
  const [groupBySection, setGroupBySection] = useState(false);

  const handleWallpaperSelect = (type, value) => {
    setWallpaper({ type, value });
  };

  const handleLayoutSelect = (layoutId) => {
    setSelectedLayout(layoutId);
    setLayoutModalOpen(false);
  };

  const handleLayoutPreview = (layoutId) => {
    setPreviewModalType(layoutId);
  };

  const selectedLayoutInfo = layoutOptions.find(l => l.id === selectedLayout);

  const getBackgroundStyle = () => {
    switch (wallpaper.type) {
      case 'color': return { backgroundColor: wallpaper.value };
      case 'gradient': return { background: wallpaper.value };
      case 'image': return { backgroundImage: `url("${wallpaper.value}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
      default: return { backgroundColor: '#22c55e' };
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={getBackgroundStyle()}>
      <div className="absolute inset-0 bg-black bg-opacity-30"></div>
      
      <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col relative z-10">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Settings</h2>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <Tabs defaultValue="heading" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-6 text-xs px-2">
            <TabsTrigger value="heading" className="text-xs">Heading</TabsTrigger>
            <TabsTrigger value="appearance" className="text-xs">Appearance</TabsTrigger>
            <TabsTrigger value="layout" className="text-xs">Layout</TabsTrigger>
            <TabsTrigger value="engagement" className="text-xs">Engagement</TabsTrigger>
            <TabsTrigger value="posts" className="text-xs">Posts</TabsTrigger>
            <TabsTrigger value="content" className="text-xs">Content</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-4">
            <TabsContent value="heading" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Heading</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm text-gray-700">Title</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 bg-gray-100" />
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Description</Label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 bg-gray-100" />
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Icon</Label>
                    <Button variant="outline" className="w-full justify-between mt-1">
                      <Calendar className="w-4 h-4" />
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="appearance" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Appearance</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-gray-700">Wallpaper</Label>
                    <Button
                      variant="outline"
                      className="w-full justify-between mt-1 h-12"
                      onClick={() => setWallpaperModalOpen(true)}
                    >
                      <div className="w-8 h-6 rounded border" style={getBackgroundStyle()} />
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Color scheme</Label>
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm" className="flex-1">Dark</Button>
                      <Button variant="default" size="sm" className="flex-1 bg-purple-600">Light</Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Font</Label>
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm">ABaa</Button>
                      <Button variant="outline" size="sm">ABaa</Button>
                      <Button variant="outline" size="sm">ABaa</Button>
                      <Button variant="default" size="sm" className="bg-purple-600">ABaa</Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-700">Post size</Label>
                    <div className="flex gap-2 mt-2">
                      <Button variant="default" size="sm" className="flex-1 bg-purple-600">Standard</Button>
                      <Button variant="outline" size="sm" className="flex-1">Wide</Button>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="layout" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Layout</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-gray-700">Format</Label>
                    <p className="text-xs text-gray-500 mb-2">Choose how posts are laid out.</p>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      onClick={() => setLayoutModalOpen(true)}
                    >
                      <div className="flex items-center gap-2">
                        {selectedLayoutInfo && <selectedLayoutInfo.icon className="w-4 h-4" />}
                        <span>{selectedLayoutInfo?.name || 'Timeline'}</span>
                      </div>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-gray-700">Group posts by section</Label>
                    </div>
                    <Switch checked={groupBySection} onCheckedChange={setGroupBySection} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="engagement" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Engagement</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-gray-700">Comments</Label>
                      <p className="text-xs text-gray-500">Allow visitors to comment on posts</p>
                    </div>
                    <Switch checked={commentsEnabled} onCheckedChange={setCommentsEnabled} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-gray-700">Reactions</Label>
                      <p className="text-xs text-gray-500">Allow visitors to react to posts</p>
                    </div>
                    <Switch checked={reactionsEnabled} onCheckedChange={setReactionsEnabled} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="posts" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Posts</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-gray-700">New posts at top</Label>
                      <p className="text-xs text-gray-500">Place newest posts at the beginning</p>
                    </div>
                    <Switch checked={newPostsAtTop} onCheckedChange={setNewPostsAtTop} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="content" className="space-y-6 mt-0">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Content</h3>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-gray-700">Allowed content types</Label>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <label className="text-sm">Text</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <label className="text-sm">Images</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" className="rounded" />
                        <label className="text-sm">Videos</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="checkbox" className="rounded" />
                        <label className="text-sm">Links</label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Wallpaper Modal */}
        <WallpaperSelector
          isOpen={wallpaperModalOpen}
          onClose={() => setWallpaperModalOpen(false)}
          currentSelection={wallpaper}
          onSelect={handleWallpaperSelect}
        />

        {/* Layout Selection Modal */}
        <LayoutSelectionModal
          isOpen={layoutModalOpen}
          onClose={() => setLayoutModalOpen(false)}
          selectedLayout={selectedLayout}
          onSelect={handleLayoutSelect}
          onPreview={handleLayoutPreview}
        />

        {/* Preview Modals */}
        <WallLayoutPreview
          isOpen={previewModalType === 'wall'}
          onClose={() => setPreviewModalType(null)}
          onSelect={handleLayoutSelect}
        />
        <ColumnsLayoutPreview
          isOpen={previewModalType === 'columns'}
          onClose={() => setPreviewModalType(null)}
          onSelect={handleLayoutSelect}
        />
        <GridLayoutPreview
          isOpen={previewModalType === 'grid'}
          onClose={() => setPreviewModalType(null)}
          onSelect={handleLayoutSelect}
        />
        <TableLayoutPreview
          isOpen={previewModalType === 'table'}
          onClose={() => setPreviewModalType(null)}
          onSelect={handleLayoutSelect}
        />
        <TimelineLayoutPreview
          isOpen={previewModalType === 'timeline'}
          onClose={() => setPreviewModalType(null)}
          onSelect={handleLayoutSelect}
        />
        <StreamLayoutPreview
          isOpen={previewModalType === 'stream'}
          onClose={() => setPreviewModalType(null)}
          onSelect={handleLayoutSelect}
        />
        <FreeformLayoutPreview
          isOpen={previewModalType === 'freeform'}
          onClose={() => setPreviewModalType(null)}
          onSelect={handleLayoutSelect}
        />
        <MapLayoutPreview
          isOpen={previewModalType === 'map'}
          onClose={() => setPreviewModalType(null)}
          onSelect={handleLayoutSelect}
        />
      </div>
    </div>
  );
};

export default SettingsPanel;