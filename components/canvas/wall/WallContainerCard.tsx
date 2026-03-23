'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import PostPreviewCard from "@/components/collabboard/PostPreviewCard";
import { Padlet } from '@/types/collabboard';
import CardShell from '@/components/collabboard/shells/CardShell';

interface WallContainerCardProps {
  container: Padlet;
  childrenPosts: Padlet[];
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onEdit?: () => void;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
}

export default function WallContainerCard({
  container,
  childrenPosts,
  onDoubleClick,
  onContextMenu,
  onEdit,
  dragProps,
}: WallContainerCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const showExpandToggle = childrenPosts.length > 2;

  const topStripRaw = container.metadata?.topStrip;
  const topStripColor = topStripRaw && topStripRaw !== 'transparent' ? topStripRaw : null;

  return (
    <div {...dragProps} onDoubleClick={onDoubleClick}>
      <CardShell
        padletId={container.id}
        isContainer
        cardColor={container.metadata?.cardColor || '#ffffff'}
        topStripColor={topStripColor}
        onContextMenu={onContextMenu}
        onEdit={onEdit}
        onExpandToggle={showExpandToggle ? () => setIsExpanded(prev => !prev) : undefined}
        isExpanded={isExpanded}
      >
        {/* Title */}
        <div className={cn(
          'text-sm font-medium text-center text-gray-800 truncate mb-2',
          showExpandToggle ? 'px-6' : ''
        )}>
          {container.title || 'New Container'}
        </div>

        {/* Body */}
        <div
          className={cn(
            'space-y-3',
            isExpanded ? 'overflow-visible min-h-[200px]' : 'overflow-y-auto min-h-[200px] max-h-[400px]',
            'hide-scrollbar'
          )}
        >
          {childrenPosts.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">
              Drop or add posts
            </div>
          ) : (
            childrenPosts.map((post) => (
              <div key={post.id} className="pointer-events-none select-none">
                <PostPreviewCard padlet={post} />
              </div>
            ))
          )}
        </div>
      </CardShell>
    </div>
  );
}
