'use client';

import { useRouter } from 'next/navigation';
import { StickyNote, Link, ListChecks, ArrowUpRight, LayoutGrid, Columns3, MessageSquareText, MoreHorizontal, ImageIcon, Upload, Pencil, Trash2, Library, Book, ArrowLeft } from 'lucide-react';

interface SidebarToolboxProps {
  onDelete?: () => void;
  hasSelection?: boolean;
  onNoteClick?: () => void;
  onLinkClick?: () => void;
  onTodoClick?: () => void;
  onLineClick?: () => void;
  onBoardClick?: () => void;
  onColumnClick?: () => void;
  onCommentClick?: () => void;
  onImageClick?: () => void;
  onLibraryClick?: () => void;
}

export default function SidebarToolbox({
  onDelete,
  hasSelection,
  onNoteClick,
  onLinkClick,
  onTodoClick,
  onLineClick,
  onBoardClick,
  onColumnClick,
  onCommentClick,
  onImageClick,
  onLibraryClick,
}: SidebarToolboxProps) {
  const router = useRouter();

  const tools = [
    { icon: StickyNote, label: "Note", action: 'note' as const, onClick: onNoteClick },
    { icon: Link, label: "Link", action: 'link' as const, onClick: onLinkClick },
    { icon: ListChecks, label: "To-do", action: 'todo' as const, onClick: onTodoClick },
    { icon: ArrowUpRight, label: "Line", action: 'line' as const, onClick: onLineClick },
    { icon: LayoutGrid, label: "Board", action: 'board' as const, onClick: onBoardClick },
    { icon: Columns3, label: "Column", action: 'column' as const, onClick: onColumnClick },
    { icon: MessageSquareText, label: "Comment", action: 'comment' as const, onClick: onCommentClick },
    { icon: MoreHorizontal, label: "", action: null, onClick: undefined },
    { icon: ImageIcon, label: "Add image", action: 'image' as const, onClick: onImageClick },
    { icon: Upload, label: "Upload", action: null, onClick: undefined },
    { icon: Pencil, label: "Draw", action: null, onClick: undefined },
    { icon: Book, label: "Library", action: 'library' as const, onClick: onLibraryClick },
    { icon: Trash2, label: "Trash", action: 'delete' as const, onClick: undefined },
  ];

  return (
    <div className="fixed top-[64px] left-0 h-[calc(100vh-64px)] w-16 bg-gray-50 border-r z-50 overflow-y-auto py-4 flex flex-col items-center space-y-6">
      {/* Back to Dashboard Button */}
      <div
        className="flex flex-col items-center space-y-1 rounded p-1 cursor-pointer hover:bg-gray-100"
        onClick={() => router.push('/dashboard')}
        title="Back to Dashboard"
      >
        <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center shadow-sm hover:bg-gray-800 transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-gray-300" />

      {tools.map((tool, i) => (
        <div
          key={i}
          className={`flex flex-col items-center space-y-1 rounded p-1 ${tool.action === 'delete' && hasSelection
            ? 'cursor-pointer hover:bg-red-100'
            : tool.action === 'delete'
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer hover:bg-gray-100'
            }`}
          onClick={() => {
            if (tool.action === 'delete' && hasSelection && onDelete) {
              onDelete();
            } else if (tool.onClick) {
              tool.onClick();
            }
          }}
          title={tool.action === 'delete' && !hasSelection ? 'Select a post first' : tool.label}
        >
          <div className={`w-10 h-10 bg-white border rounded-lg flex items-center justify-center ${tool.action === 'delete' && hasSelection ? 'border-red-300 text-red-500' : ''
            }`}>
            <tool.icon className="w-5 h-5 text-gray-600" />
          </div>
          {tool.label && <span className="text-[10px] text-gray-500 text-center">{tool.label}</span>}
        </div>
      ))}
    </div>
  );
}
