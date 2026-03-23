'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Calendar, Clock } from 'lucide-react';
import { samplePadlets } from '../sampleData';
import type { LayoutPreviewProps } from '../types';
import PostPreviewCard from '@/components/collabboard/PostPreviewCard';

const TimelineLayoutPreview: React.FC<LayoutPreviewProps> = ({ isOpen, onClose, onSelect }) => {
    const handleSelect = () => {
        onSelect('timeline');
        onClose();
    };

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
                        {/* Timeline line */}
                        <div className="absolute top-16 left-0 right-0 h-0.5 bg-purple-300"></div>

                        <div className="flex justify-between items-start pt-4 gap-4 overflow-x-auto">
                            {samplePadlets.slice(0, 4).map((padlet, index) => (
                                <div key={padlet.id} className="flex flex-col items-center max-w-48 flex-shrink-0">
                                    {/* Timeline dot */}
                                    <div className="w-4 h-4 bg-purple-500 rounded-full mb-4 relative z-10 shadow-lg"></div>

                                    {/* Content card */}
                                    <div className="bg-white rounded-lg shadow-md p-4 border hover:shadow-lg transition-shadow">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Clock className="w-3 h-3 text-gray-400" />
                                            <span className="text-xs text-gray-500">{padlet.date}</span>
                                        </div>
                                        <h4 className="font-semibold text-sm mb-2">{padlet.title}</h4>
                                        <PostPreviewCard padlet={padlet as any} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center p-4 border-t">
                    <p className="text-sm text-gray-600">
                        Events arranged chronologically along a timeline - perfect for project milestones and history
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>Close</Button>
                        <Button onClick={handleSelect}>Select Timeline Layout</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default TimelineLayoutPreview;
