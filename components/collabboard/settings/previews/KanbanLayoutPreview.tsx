'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Kanban } from 'lucide-react';
import type { LayoutPreviewProps } from '../types';

const KanbanLayoutPreview: React.FC<LayoutPreviewProps> = ({ isOpen, onClose, onSelect }) => {
    const handleSelect = () => {
        onSelect('kanban');
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
                <DialogHeader className="flex flex-row items-center justify-between">
                    <DialogTitle className="flex items-center gap-2">
                        <Kanban className="w-5 h-5" />
                        Kanban Layout - Task Management
                    </DialogTitle>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </Button>
                </DialogHeader>

                <div className="flex-1 overflow-auto p-4 bg-gradient-to-br from-indigo-50 to-blue-50">
                    <div className="flex gap-4 min-h-[400px]">
                        {/* To Do Column */}
                        <div className="w-64 bg-gray-100 rounded-lg p-3">
                            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-gray-400"></span>
                                To Do
                                <span className="ml-auto text-sm text-gray-500">3</span>
                            </h3>
                            <div className="space-y-2">
                                <div className="bg-white p-3 rounded-lg shadow-sm border">
                                    <p className="text-sm font-medium">Research competitors</p>
                                    <div className="flex gap-1 mt-2">
                                        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">Low</span>
                                    </div>
                                </div>
                                <div className="bg-white p-3 rounded-lg shadow-sm border">
                                    <p className="text-sm font-medium">Design wireframes</p>
                                    <div className="flex gap-1 mt-2">
                                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">Medium</span>
                                    </div>
                                </div>
                                <div className="bg-white p-3 rounded-lg shadow-sm border">
                                    <p className="text-sm font-medium">Write documentation</p>
                                </div>
                            </div>
                        </div>

                        {/* In Progress Column */}
                        <div className="w-64 bg-blue-50 rounded-lg p-3">
                            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-blue-400"></span>
                                In Progress
                                <span className="ml-auto text-sm text-gray-500">2</span>
                            </h3>
                            <div className="space-y-2">
                                <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-200">
                                    <p className="text-sm font-medium">Implement authentication</p>
                                    <div className="flex gap-1 mt-2">
                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">High</span>
                                    </div>
                                </div>
                                <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-200">
                                    <p className="text-sm font-medium">Create API endpoints</p>
                                    <div className="flex gap-1 mt-2">
                                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">Medium</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Done Column */}
                        <div className="w-64 bg-green-50 rounded-lg p-3">
                            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-green-400"></span>
                                Done
                                <span className="ml-auto text-sm text-gray-500">2</span>
                            </h3>
                            <div className="space-y-2">
                                <div className="bg-white p-3 rounded-lg shadow-sm border border-green-200 opacity-75">
                                    <p className="text-sm font-medium line-through text-gray-500">Setup project</p>
                                </div>
                                <div className="bg-white p-3 rounded-lg shadow-sm border border-green-200 opacity-75">
                                    <p className="text-sm font-medium line-through text-gray-500">Configure database</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center p-4 border-t">
                    <p className="text-sm text-gray-600">
                        Organize tasks with drag-and-drop cards across customizable columns
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>Close</Button>
                        <Button onClick={handleSelect}>Select Kanban Layout</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default KanbanLayoutPreview;
