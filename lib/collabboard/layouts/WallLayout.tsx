// WallLayout.tsx - Updated to be a flexible drop zone.
import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Edit2, Trash2, Pin, Share, Copy } from 'lucide-react';

interface Padlet {
  id: string;
  title: string;
  content: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
  likes_count?: number;
  is_pinned?: boolean;
}

interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

interface WallLayoutProps {
  columns: ColumnData[];
  canvasId: string;
  isEditable?: boolean;
  onEditItem?: (padlet: Padlet, columnId?: string) => void;
  onDeleteItem?: (padletId: string, columnId: string) => void;
  onLikeItem?: (padletId: string) => void;
  onPinItem?: (padletId: string) => void;
  onShareItem?: (padletId: string) => void;
  // New props for drop zone functionality
  containerRef?: React.Ref<HTMLDivElement>;
  getBackgroundStyle?: () => React.CSSProperties;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
}

export const WallLayout: React.FC<WallLayoutProps> = ({
  columns,
  canvasId,
  isEditable = false,
  onEditItem,
  onDeleteItem,
  onLikeItem,
  onPinItem,
  onShareItem,
  containerRef,
  getBackgroundStyle,
  onDrop,
  onDragOver
}) => {
  // Get all padlets from all columns
  const allPadlets = columns.flatMap(col => col.items);

  return (
    <div
      ref={containerRef}
      className="canvas-container flex-1 w-full overflow-auto p-6"
      style={getBackgroundStyle ? getBackgroundStyle() : undefined}
      onDrop={onDrop || ((e) => e.preventDefault())}
      onDragOver={onDragOver || ((e) => e.preventDefault())}
    >
      {/* Masonry-style Grid Layout */}
      <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
        {allPadlets.map((padlet) => (
          <div
            key={padlet.id}
            data-padlet-id={padlet.id}
            className="padlet bg-white rounded-lg shadow-md border p-4 group hover:shadow-lg transition-all duration-300 break-inside-avoid mb-4 cursor-pointer"
            onClick={() => onEditItem?.(padlet)}
          >
            {/* Header with 3-dot menu */}
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-sm line-clamp-2 flex-1 pr-2">
                {padlet.title}
              </h3>

              {isEditable && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('🔧 Dropdown trigger clicked');
                      }}
                    >
                      <MoreVertical size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-48 bg-white border border-gray-200 shadow-lg"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditItem?.(padlet);
                      }}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <Edit2 className="mr-2 h-4 w-4" />
                      Edit post
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onPinItem?.(padlet.id);
                      }}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <Pin className="mr-2 h-4 w-4" />
                      {padlet.is_pinned ? 'Unpin' : 'Pin'} post
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        const shareUrl = `${window.location.origin}/dashboard/canvas/${canvasId}#padlet-${padlet.id}`;
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(shareUrl);
                        }
                      }}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy link
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onShareItem?.(padlet.id);
                      }}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <Share className="mr-2 h-4 w-4" />
                      Share post
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        // Using a custom modal/confirm dialog is better than window.confirm
                        if (window.confirm(`Delete "${padlet.title}"?`)) {
                          onDeleteItem?.(padlet.id, columns[0]?.id || 'main');
                        }
                      }}
                      className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete post
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* File/Image Display */}
            {padlet.file_url && (
              <div className="mb-3">
                {padlet.file_type?.startsWith('image/') ? (
                  <div className="relative rounded-lg overflow-hidden">
                    <img
                      src={padlet.file_url}
                      alt={padlet.file_name || 'Uploaded image'}
                      className="w-full object-cover rounded cursor-pointer border"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(padlet.file_url, '_blank');
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded border overflow-hidden">
                    <span className="text-lg">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{padlet.file_name}</p>
                      <p className="text-xs text-gray-500">
                        {padlet.file_size ? `${Math.round(padlet.file_size / 1024)}KB` : ''}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Content */}
            <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-4 leading-relaxed">
              {padlet.content}
            </p>

            {/* Engagement Stats */}
            <div className="flex items-center justify-between text-xs text-gray-500 mt-3">
              <div className="flex items-center gap-3">
                {padlet.likes_count !== undefined && (
                  <button
                    className="flex items-center gap-1 hover:text-red-500 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLikeItem?.(padlet.id);
                    }}
                  >
                    ❤️ {padlet.likes_count}
                  </button>
                )}
              </div>

              {padlet.is_pinned && (
                <Pin size={12} className="text-blue-500" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {allPadlets.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            📝
          </div>
          <h3 className="text-lg font-semibold mb-2">Your Wall is Empty</h3>
          <p className="text-sm mb-4">Use the + button to add your first padlet</p>
        </div>
      )}

      {/* SINGLE Add Button - No conflicts */}
      {isEditable && (
        <button
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg z-50"
          onClick={() => {
            console.log('🆕 SINGLE Wall button clicked');
            // Create a simple padlet directly
            const newPadlet = {
              title: 'New Wall Post',
              content: 'Click to edit this content...'
            };
            // This needs to be wired to your handler for creating padlets.
          }}
        >
          <span className="text-2xl">+</span>
        </button>
      )}
    </div>
  );
};

// WallPreview component for CanvasSetupPage preview
export interface WallPreviewProps {
  columns: ColumnData[];
  config: { newPostsAtTop?: boolean };
  onEditItem: (padlet: Padlet, columnId?: string) => void;
  onAddPost: (columnId: string) => void;
  onDeleteItem?: (padletId: string, columnId: string) => void;
  onLikeItem?: (padletId: string) => void;
  onPinItem?: (padletId: string) => void;
  onShareItem?: (padletId: string) => void;
}

export const WallPreview: React.FC<WallPreviewProps> = ({
  columns,
  config = {},
  onEditItem,
  onAddPost,
  onDeleteItem,
  onLikeItem,
  onPinItem,
  onShareItem
}) => {
  const { newPostsAtTop = false } = config;

  // Get all padlets from all columns
  const allPadlets = columns.flatMap(col => col.items);
  const displayedPadlets = newPostsAtTop ? [...allPadlets].reverse() : allPadlets;

  if (displayedPadlets.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            📝
          </div>
          <p>Add some content to see the Wall layout preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[600px] p-4 bg-gray-50 rounded-lg border overflow-auto">
      {/* Masonry-style Grid Layout */}
      <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
        {displayedPadlets.map((padlet) => {
          const sourceColumn = columns.find(col =>
            col.items.some(item => item.id === padlet.id)
          );

          return (
            <div
              key={padlet.id}
              className="padlet bg-white rounded-lg shadow-md border p-4 group hover:shadow-lg transition-all duration-300 break-inside-avoid mb-4 cursor-pointer"
              onClick={() => onEditItem(padlet, sourceColumn?.id)}
            >
              {/* Header with 3-dot menu */}
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-sm line-clamp-2 flex-1 pr-2">
                  {padlet.title}
                </h3>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical size={14} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-white border border-gray-200 shadow-lg" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditItem(padlet, sourceColumn?.id);
                      }}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <Edit2 className="mr-2 h-4 w-4" />
                      Edit post
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onPinItem?.(padlet.id);
                      }}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <Pin className="mr-2 h-4 w-4" />
                      {padlet.is_pinned ? 'Unpin' : 'Pin'} post
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onShareItem?.(padlet.id);
                      }}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <Share className="mr-2 h-4 w-4" />
                      Share post
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete "${padlet.title}"?`) && sourceColumn) {
                          onDeleteItem?.(padlet.id, sourceColumn.id);
                        }
                      }}
                      className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete post
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Content */}
              <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-4 leading-relaxed">
                {padlet.content}
              </p>

              {/* Engagement Stats */}
              <div className="flex items-center justify-between text-xs text-gray-500 mt-3">
                <div className="flex items-center gap-3">
                  {padlet.likes_count !== undefined && (
                    <button
                      className="flex items-center gap-1 hover:text-red-500 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLikeItem?.(padlet.id);
                      }}
                    >
                      ❤️ {padlet.likes_count}
                    </button>
                  )}
                </div>
                {padlet.is_pinned && (
                  <Pin size={12} className="text-blue-500" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Button */}
      <button
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg z-50"
        onClick={() => {
          if (columns.length > 0) {
            onAddPost(columns[0].id);
          }
        }}
      >
        <span className="text-2xl">+</span>
      </button>
    </div>
  );
};

export default WallLayout;
