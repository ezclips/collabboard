import React from "react";
import { Padlet } from "@/types/collabboard";

// ────────────────────────────────────────────────────────────────
//  dnd-kit imports
// ────────────────────────────────────────────────────────────────
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type WallLayoutProps = {
  padlets: Padlet[];
  selectedPadletId: string | null;
  onSelect: (id: string) => void;
  onOpen: (padlet: Padlet) => void;
  handleWallReorder: (draggedId: string, targetIndex: number) => void;
};

export default function WallLayout({
  padlets,
  selectedPadletId,
  onSelect,
  onOpen,
  handleWallReorder,
}: WallLayoutProps) {

  // ────────────────────────────────────────────────────────────────
  //  Only root CONTAINERS — ignore child posts/notes/images/etc.
  // ────────────────────────────────────────────────────────────────
  const rootContainers = React.useMemo(() => {
    return padlets
      .filter(
        (p) =>
          p.type === 'container' &&
          !(p.metadata as any)?.parentId
      )
      .sort((a, b) => {
        const posA = ((a.metadata as any)?.wallPosition as number | undefined) ?? Infinity;
        const posB = ((b.metadata as any)?.wallPosition as number | undefined) ?? Infinity;
        if (posA !== posB) return posA - posB;

        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA; // Newest first
      });
  }, [padlets]);

  // dnd-kit sensors & drag-end handler
  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = rootContainers.findIndex((p) => p.id === active.id);
    const newIndex = rootContainers.findIndex((p) => p.id === over.id);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    // Pass the visual target index among root containers
    handleWallReorder(active.id as string, newIndex);
  };

  return (
    <div className="w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-6">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={rootContainers.map((p) => p.id)}
          strategy={rectSortingStrategy}
        >
          <div
            className="grid gap-4 content-start items-start justify-items-stretch w-full"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            }}
          >
            {rootContainers.map((padlet, visualIndex) => (
              <SortableContainer
                key={padlet.id}
                id={padlet.id}
                padlet={padlet}
                visualIndex={visualIndex}
                isSelected={selectedPadletId === padlet.id}
                onSelect={onSelect}
                onOpen={onOpen}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
//  Sortable wrapper for each root container
// ────────────────────────────────────────────────────────────────
function SortableContainer({
  id,
  padlet,
  visualIndex,
  isSelected,
  onSelect,
  onOpen,
}: {
  id: string;
  padlet: Padlet;
  visualIndex: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onOpen: (padlet: Padlet) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    minHeight: 200,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[
        "relative bg-white rounded-lg shadow-md transition-all duration-200",
        "w-full min-w-0",
        isSelected ? "ring-2 ring-blue-500 ring-offset-2" : "hover:shadow-xl",
        isDragging ? "opacity-60 scale-[0.975] shadow-2xl z-50" : "",
        "cursor-grab active:cursor-grabbing",
      ].join(" ")}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(padlet.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen(padlet);
      }}
    >
      {isDragging && (
        <div
          className="absolute z-50 w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-base font-bold shadow-xl border-2 border-white -top-4 -left-4"
        >
          {visualIndex + 1}
        </div>
      )}

      <div className="p-4 select-none">
        {padlet.type === "image" && padlet.image_url && (
          <img
            src={padlet.image_url}
            alt={padlet.title || "Image"}
            className="w-full h-40 object-cover rounded-md mb-2 pointer-events-none"
            onDragStart={(e) => e.preventDefault()}
          />
        )}

        {padlet.title && (
          <h3 className="font-semibold text-gray-800 mb-2 break-words line-clamp-2">
            {padlet.title}
          </h3>
        )}

        {padlet.content && (
          <div
            className="text-sm text-gray-600 line-clamp-4 break-words"
            dangerouslySetInnerHTML={{ __html: padlet.content }}
          />
        )}
      </div>
    </div>
  );
}