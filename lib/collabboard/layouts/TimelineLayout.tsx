// lib/collabboard/layouts/TimelineLayout.tsx

import React, { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreVertical,
  Edit2,
  Plus,
  Trash2
} from "lucide-react";
import SafeHtmlContent from "@/components/collabboard/SafeHtmlContent";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PadletPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TimelineConfig {
  // Current settings
  newPostsAtTop: boolean;

  // Future timeline-specific settings
  direction: 'horizontal' | 'vertical';
  style: 'linear' | 'curved' | 'stepped';
  showDateStamps: boolean;
  dateFormat: 'relative' | 'absolute' | 'custom';
  timelineThickness: number;
  itemSpacing: 'tight' | 'normal' | 'loose';
  alternatePositions: boolean; // items above/below or left/right
  animationEnabled: boolean;
  animationSpeed: 'slow' | 'normal' | 'fast';
  colorTheme: 'default' | 'blue' | 'green' | 'purple' | 'custom';
  customColors: {
    timeline: string;
    nodes: string;
    background: string;
  };

  // Collaboration settings
  realTimeUpdates: boolean;
  allowReordering: boolean;
  showAuthorInfo: boolean;

  // Access control
  viewPermissions: 'public' | 'restricted' | 'private';
  editPermissions: 'owner' | 'collaborators' | 'anyone';
}

export interface Padlet {
  id: string;
  title: string;
  content: string;
  board_id?: string;
  created_at?: string;
  author_id?: string;
  position_in_timeline?: number;
}

export interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

export interface TimelinePreviewProps {
  columns: ColumnData[];
  config: Partial<TimelineConfig>;
  onEditItem: (padlet: Padlet, columnId?: string) => void;
  onAddPost: (columnId: string) => void;
  onDeleteItem?: (padletId: string, columnId: string) => void;
}

export interface TimelineLiveCanvasProps extends TimelinePreviewProps {
  canvasId: string;
  isEditable: boolean;
  collaborators?: any[];
  onSave?: (padlets: Padlet[]) => void;
}

export interface TimelineSettingsProps {
  config: TimelineConfig;
  onChange: (config: Partial<TimelineConfig>) => void;
  onSave: () => void;
}

// ============================================================================
// POSITIONING CALCULATION FUNCTION
// ============================================================================

/**
 * Timeline Layout - Arranges padlets horizontally in chronological order
 * Creates a horizontal timeline with padlets positioned at regular intervals
 */
export function calculateTimelinePositions(
  count: number,
  canvasWidth: number,
  canvasHeight?: number
): PadletPosition[] {
  if (count === 0) return [];

  const positions: PadletPosition[] = [];
  const padding = 40;
  const timelineHeight = 120;
  const padletWidth = 200;
  const padletHeight = 100;

  // Center the timeline vertically
  const timelineY = canvasHeight ? (canvasHeight - timelineHeight) / 2 : 250;

  // Calculate spacing between padlets
  const availableWidth = canvasWidth - (2 * padding);
  const spacing = count > 1 ? Math.max(250, availableWidth / count) : availableWidth;

  // Create timeline positions
  for (let i = 0; i < count; i++) {
    const x = padding + (i * spacing);

    // Alternate padlets above and below the timeline
    const isAbove = i % 2 === 0;
    const y = isAbove
      ? timelineY - padletHeight - 20  // Above timeline
      : timelineY + timelineHeight + 20; // Below timeline

    positions.push({
      top: Math.max(0, y),
      left: Math.max(0, x),
      width: padletWidth,
      height: padletHeight
    });
  }

  return positions;
}

// ============================================================================
// TIMELINE PREVIEW COMPONENT (For Canvas Setup)
// ============================================================================

export const TimelinePreview: React.FC<TimelinePreviewProps> = ({
  columns,
  config = {},
  onEditItem,
  onAddPost,
  onDeleteItem
}) => {
  const { newPostsAtTop = false } = config;

  // Get all padlets from columns and apply ordering
  const allPadlets = columns.flatMap(col => col.items);
  const displayedPadlets = newPostsAtTop ? [...allPadlets].reverse() : allPadlets;

  if (displayedPadlets.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
        Add some content to see the Timeline layout preview
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-[600px] p-4 bg-white rounded-lg border overflow-x-auto">
      <div className="relative w-full p-8">
        <div className="flex items-start gap-12 min-w-max pb-8">
          {/* Timeline Line */}
          <div
            className="absolute top-12 h-0.5 bg-gradient-to-r from-blue-400 to-blue-600"
            style={{
              left: '80px',
              right: '80px',
              width: `${displayedPadlets.length * 280 - 80}px`
            }}
          />

          {/* Timeline Items */}
          {displayedPadlets.map((padlet, index) => (
            <div key={padlet.id} className="relative flex flex-col items-center min-w-[240px]">
              {/* Timeline Node */}
              <div className="relative z-10 w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow-lg mb-6 flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full" />
              </div>

              {/* Padlet Card */}
              <div
                className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 w-full max-w-[240px] cursor-pointer hover:shadow-xl transition-all duration-200 hover:scale-105 relative group"
                onClick={() => {
                  const sourceColumn = columns.find(col =>
                    col.items.some(item => item.id === padlet.id)
                  );
                  onEditItem(padlet, sourceColumn?.id);
                }}
              >
                {/* Dropdown Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-white border border-gray-200 shadow-lg">
                    <DropdownMenuItem onClick={() => {
                      const sourceColumn = columns.find(col =>
                        col.items.some(item => item.id === padlet.id)
                      );
                      onEditItem(padlet, sourceColumn?.id);
                    }}>
                      <Edit2 className="mr-2 h-4 w-4" />
                      Edit post
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem onClick={() => {
                      const sourceColumn = columns.find(col =>
                        col.items.some(item => item.id === padlet.id)
                      );
                      if (sourceColumn) {
                        onAddPost(sourceColumn.id);
                      }
                    }}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add post before
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      const sourceColumn = columns.find(col =>
                        col.items.some(item => item.id === padlet.id)
                      );
                      if (sourceColumn) {
                        onAddPost(sourceColumn.id);
                      }
                    }}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add post after
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete "${padlet.title}"?`)) {
                          const sourceColumn = columns.find(col =>
                            col.items.some(item => item.id === padlet.id)
                          );
                          if (sourceColumn && onDeleteItem) {
                            onDeleteItem(padlet.id, sourceColumn.id);
                          }
                        }
                      }}
                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete post
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Step Number */}
                <div className="text-center mb-3">
                  <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                    Step {index + 1}
                  </span>
                </div>

                {/* Content */}
                <h4 className="font-bold text-gray-900 text-lg mb-3 text-center">
                  {padlet.title}
                </h4>
                <SafeHtmlContent
                  content={padlet.content}
                  className="text-gray-600 text-sm leading-relaxed text-center"
                />

                {/* Decorative Element */}
                <div className="mt-4 flex justify-center">
                  <div className="w-8 h-1 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add New Item Button */}
        <div className="flex justify-center mt-8">
          <Button
            variant="outline"
            className="flex items-center gap-2 px-6 py-3 border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50"
            onClick={() => {
              if (columns.length > 0) {
                onAddPost(columns[0].id);
              }
            }}
          >
            <Plus size={18} />
            Add Timeline Item
          </Button>
        </div>

        {/* Timeline Progress Indicators */}
        <div className="flex justify-between mt-6 text-xs text-gray-400 font-medium">
          <span>Start</span>
          <span>Timeline Progress</span>
          <span>End</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// TIMELINE LIVE CANVAS COMPONENT (Future Implementation)
// ============================================================================

export const TimelineLiveCanvas: React.FC<TimelineLiveCanvasProps> = ({
  canvasId,
  isEditable,
  columns,
  config = {},
  collaborators = [],
  onEditItem,
  onAddPost,
  onDeleteItem,
  onSave
}) => {
  // TODO: Implement live canvas functionality
  // - Real-time collaboration
  // - Drag and drop reordering
  // - Live updates
  // - Student interaction mode

  return (
    <div className="relative w-full h-full">
      {/* Placeholder for live canvas */}
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Timeline Live Canvas</h3>
          <p>Canvas ID: {canvasId}</p>
          <p>Editable: {isEditable ? 'Yes' : 'No'}</p>
          <p>Collaborators: {collaborators.length}</p>
          <p className="text-sm text-gray-400 mt-2">Coming soon...</p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// TIMELINE SETTINGS COMPONENT (Future Implementation)
// ============================================================================

export const TimelineSettings: React.FC<TimelineSettingsProps> = ({
  config,
  onChange,
  onSave
}) => {
  // TODO: Implement timeline-specific settings
  // - Direction (horizontal/vertical)
  // - Style (linear/curved/stepped)
  // - Date stamps
  // - Animations
  // - Colors
  // - Permissions

  return (
    <div className="space-y-6 p-4">
      <h3 className="text-lg font-semibold">Timeline Settings</h3>

      {/* Placeholder for settings UI */}
      <div className="text-gray-500">
        <p>Timeline-specific settings will include:</p>
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Timeline direction (horizontal/vertical)</li>
          <li>Visual style (linear/curved/stepped)</li>
          <li>Date stamp display</li>
          <li>Item spacing and positioning</li>
          <li>Color themes</li>
          <li>Animation settings</li>
          <li>Collaboration permissions</li>
        </ul>
        <p className="text-sm mt-4">Coming soon...</p>
      </div>
    </div>
  );
};

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const defaultTimelineConfig: TimelineConfig = {
  // Current settings
  newPostsAtTop: false,

  // Future settings with defaults
  direction: 'horizontal',
  style: 'linear',
  showDateStamps: false,
  dateFormat: 'relative',
  timelineThickness: 2,
  itemSpacing: 'normal',
  alternatePositions: true,
  animationEnabled: true,
  animationSpeed: 'normal',
  colorTheme: 'default',
  customColors: {
    timeline: '#3b82f6',
    nodes: '#3b82f6',
    background: '#ffffff'
  },
  realTimeUpdates: true,
  allowReordering: true,
  showAuthorInfo: false,
  viewPermissions: 'public',
  editPermissions: 'collaborators'
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const getTimelineStepPosition = (
  index: number,
  total: number,
  config: Partial<TimelineConfig> = {}
): { x: number; y: number; isAbove: boolean } => {
  const { direction = 'horizontal', alternatePositions = true } = config;

  if (direction === 'horizontal') {
    const spacing = 280; // Default spacing between items
    const x = 80 + (index * spacing);
    const isAbove = alternatePositions ? index % 2 === 0 : false;
    const y = isAbove ? 150 : 350; // Above or below timeline

    return { x, y, isAbove };
  } else {
    // Vertical timeline logic (future implementation)
    return { x: 200, y: 80 + (index * 200), isAbove: false };
  }
};

export const validateTimelineConfig = (config: Partial<TimelineConfig>): boolean => {
  // Add validation logic for timeline configuration
  return true;
};

export const formatTimelineDate = (
  date: Date,
  format: TimelineConfig['dateFormat'] = 'relative'
): string => {
  // TODO: Implement date formatting for timeline items
  switch (format) {
    case 'relative':
      return 'Just now'; // Placeholder
    case 'absolute':
      return date.toLocaleDateString();
    case 'custom':
      return date.toISOString();
    default:
      return date.toLocaleDateString();
  }
};