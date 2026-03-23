// You'll need this component for the drag & drop functionality
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';

interface SortablePadletProps {
  padlet: { id: string; title: string; content: string };
}

import PostCardContent from '@/components/collabboard/PostCardContent';

export const SortablePadlet: React.FC<SortablePadletProps> = ({ padlet }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: padlet.id,
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="bg-white p-3 rounded-lg shadow-sm cursor-grab active:cursor-grabbing"
    >
      <PostCardContent padlet={padlet as any} />
    </div>
  );
};