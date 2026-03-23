import { FC } from 'react';
import type { Padlet } from '@/types/collabboard';

interface WallLayoutProps {
  columns: {
    id: string;
    title: string;
    items: Padlet[];
  }[];
  canvasId: string;
  isEditable: boolean;
  onEditItem: (padlet: Padlet) => void;
  onDeleteItem: (padletId: string) => void;
  onPadletCreated: (padlet: Partial<Padlet>) => void;
  onLikeItem: (padletId: string) => void;
  onPinItem: (padletId: string) => void;
  onShareItem: (padletId: string) => void;
}

import PostCardContent from '@/components/collabboard/PostCardContent';

export const WallLayout: FC<WallLayoutProps> = ({
  columns,
  canvasId,
  isEditable,
  onEditItem,
  onDeleteItem,
  onPadletCreated,
  onLikeItem,
  onPinItem,
  onShareItem
}) => {
  return (
    <div className="wall-layout grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {columns[0]?.items.map((padlet) => (
        <div key={padlet.id} className="wall-item bg-white rounded-lg shadow-md p-4">
          <PostCardContent padlet={padlet} />
          <div className="flex justify-end gap-2 mt-4">
            {isEditable && (
              <>
                <button onClick={() => onEditItem(padlet)} className="text-blue-500 hover:text-blue-600">
                  Edit
                </button>
                <button onClick={() => onDeleteItem(padlet.id)} className="text-red-500 hover:text-red-600">
                  Delete
                </button>
              </>
            )}
            <button onClick={() => onLikeItem(padlet.id)} className="text-gray-500 hover:text-gray-600">
              {padlet.likes_count || 0} ❤️
            </button>
            <button onClick={() => onPinItem(padlet.id)} className="text-gray-500 hover:text-gray-600">
              {padlet.is_pinned ? '📌' : '📍'}
            </button>
            <button onClick={() => onShareItem(padlet.id)} className="text-gray-500 hover:text-gray-600">
              Share
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
