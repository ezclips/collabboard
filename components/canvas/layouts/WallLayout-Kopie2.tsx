// components/canvas/layouts/WallLayout.tsx
import React from "react";

import { Padlet } from "@/types/collabboard";

type WallLayoutProps = {
  padlets: Padlet[];
  selectedPadletId: string | null;
  onSelect: (id: string) => void;
  onOpen: (padlet: Padlet) => void;

  wallDraggingId: string | null;
  wallDragOverIndex: number | null;
  setWallDraggingId: (id: string | null) => void;
  setWallDragOverIndex: (index: number | null) => void;
  handleWallReorder: (draggedId: string, targetIndex: number) => void;
};

export default function WallLayout({
  padlets,
  selectedPadletId,
  onSelect,
  onOpen,
  wallDraggingId,
  wallDragOverIndex,
  setWallDraggingId,
  setWallDragOverIndex,
  handleWallReorder,
}: WallLayoutProps) {
  return (
    <div className="w-full max-w-full min-w-0 overflow-hidden px-6 py-6">
      {/* Grid keeps everything inside viewport and reflows columns on resize */}
      <div
        className="
          grid gap-4 content-start justify-center w-full
        "
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        {padlets.map((padlet, index) => {
          const isDragTarget = wallDragOverIndex === index && wallDraggingId !== padlet.id;
          const isBeingDragged = wallDraggingId === padlet.id;

          return (
            <div
              key={padlet.id}
              className={[
                "relative bg-white rounded-lg shadow-md transition-all cursor-grab",
                "w-full max-w-[320px] min-w-0", // <- critical: shrink inside grid cell
                selectedPadletId === padlet.id ? "ring-2 ring-blue-500" : "hover:shadow-lg",
                isBeingDragged ? "opacity-50 scale-[0.98]" : "",
                isDragTarget ? "ring-2 ring-green-500 ring-offset-2" : "",
              ].join(" ")}
              style={{ minHeight: 200 }}
              draggable
              onDragStart={(e) => {
                setWallDraggingId(padlet.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/wall-padlet-id", padlet.id);
              }}
              onDragEnd={() => {
                setWallDraggingId(null);
                setWallDragOverIndex(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (wallDraggingId && wallDraggingId !== padlet.id) {
                  setWallDragOverIndex(index);
                }
              }}
              onDragLeave={() => {
                if (wallDragOverIndex === index) setWallDragOverIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData("text/wall-padlet-id");
                if (draggedId && draggedId !== padlet.id) {
                  handleWallReorder(draggedId, index);
                }
                setWallDraggingId(null);
                setWallDragOverIndex(null);
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(padlet.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onOpen(padlet);
              }}
            >
              {wallDraggingId && (
                <div
                  className="absolute z-50 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-lg border-2 border-white"
                  style={{ top: -12, left: -12 }}
                >
                  {index + 1}
                </div>
              )}

              <div className="p-4">
                {padlet.type === "image" && padlet.image_url && (
                  <img
                    src={padlet.image_url}
                    alt={padlet.title || "Image"}
                    className="w-full h-40 object-cover rounded-md mb-2"
                  />
                )}

                {padlet.title && (
                  <h3 className="font-semibold text-gray-800 mb-2 break-words">{padlet.title}</h3>
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
        })}
      </div>
    </div>
  );
}
