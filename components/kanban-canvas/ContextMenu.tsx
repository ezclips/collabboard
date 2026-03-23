'use client';

// import './context-menu.css'; // Removed to rely on inline/utility styles for reliability
import { memo, useState, useEffect, useRef } from 'react';
import {
  Edit,
  Trash2,
  Copy,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Tag,
  Calendar,
  User,
  Link as LinkIcon,
  Plus,
} from 'lucide-react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  separator?: boolean;
  children?: ContextMenuItem[];
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export const ContextMenu = memo(function ContextMenu({
  items,
  position,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [openPath, setOpenPath] = useState<string[]>([]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let { x, y } = position;

      // Adjust horizontal position if menu goes off screen
      if (x + rect.width > viewportWidth) {
        x = viewportWidth - rect.width - 10;
      }

      // Adjust vertical position if menu goes off screen
      if (y + rect.height > viewportHeight) {
        y = viewportHeight - rect.height - 10;
      }

      setAdjustedPosition({ x, y });
    }
  }, [position]);

  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} />
      <div
        ref={menuRef}
        className="context-menu fixed z-50 min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-xl p-1"
        style={{
          left: `${adjustedPosition.x}px`,
          top: `${adjustedPosition.y}px`,
          backgroundColor: '#ffffff', // Explicit inline fallback
        }}
      >
        <MenuList
          items={items}
          onItemClick={(item) => {
            item.onClick();
            onClose();
          }}
          openPath={openPath}
          setOpenPath={setOpenPath}
          parentPath={[]}
          isRoot
        />
      </div>
    </>
  );
});

function MenuList({
  items,
  onItemClick,
  openPath,
  setOpenPath,
  parentPath,
  isRoot = false,
}: {
  items: ContextMenuItem[];
  onItemClick: (item: ContextMenuItem) => void;
  openPath: string[];
  setOpenPath: (path: string[]) => void;
  parentPath: string[];
  isRoot?: boolean;
}) {
  return (
    <div
      className={
        isRoot
          ? ''
          : 'absolute left-full top-0 ml-1 min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-xl p-1'
      }
    >
      {items.map((item, index) => {
        const hasChildren = !!item.children && item.children.length > 0;
        const currentPath = [...parentPath, item.id];
        const isOpen =
          hasChildren &&
          openPath.length >= currentPath.length &&
          currentPath.every((segment, i) => openPath[i] === segment);

        return (
          <div
            key={item.id || index}
            className="relative"
            onMouseEnter={() => {
              if (hasChildren) setOpenPath(currentPath);
            }}
          >
            {item.separator ? (
              <div className="h-px bg-gray-200 my-1" />
            ) : (
              <button
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-gray-100 ${
                  item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-900'
                }`}
                onClick={() => {
                  if (hasChildren) {
                    setOpenPath(currentPath);
                    return;
                  }
                  onItemClick(item);
                }}
              >
                {item.icon && <span className="h-4 w-4 shrink-0">{item.icon}</span>}
                <span className="flex-1 text-left truncate">{item.label}</span>
                {hasChildren && <span className="text-xs text-gray-500">▶</span>}
              </button>
            )}

            {hasChildren && isOpen && (
              <MenuList
                items={item.children || []}
                onItemClick={onItemClick}
                openPath={openPath}
                setOpenPath={setOpenPath}
                parentPath={currentPath}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Predefined menu icons for convenience
export const MenuIcons = {
  Edit,
  Trash2,
  Copy,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Tag,
  Calendar,
  User,
  Link: LinkIcon,
  Plus,
};
