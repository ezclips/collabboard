import React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { DotsVerticalIcon } from "@radix-ui/react-icons";
import { useNavigate } from "react-router-dom";

export default function BoardPreview({ board }) {
  const navigate = useNavigate();

  return (
    <div
      className="border rounded overflow-hidden cursor-pointer hover:shadow transition group"
      onClick={() => navigate(`/boards/${board.id}`)}
      style={{
        background:
          board.background_type === "color"
            ? board.background_value
            : board.background_type === "gradient"
            ? board.background_value
            : board.background_type === "image"
            ? `url(${board.background_value}) center/cover no-repeat`
            : "#f3f4f6",
        height: "140px",
        display: "flex",
        alignItems: "flex-end",
        padding: "0.5rem",
      }}
    >
      {/* TEST: Add a visible indicator */}
      <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
        UPDATED!
      </div>

      <div className="w-full flex justify-between items-center bg-white/80 backdrop-blur px-2 py-1 rounded text-sm font-medium truncate">
        <span>{board.title}</span>
        
        <div className="flex items-center space-x-1">
          {/* TEST: Simple comments button */}
          <button
            className="p-1 rounded hover:bg-gray-100 bg-blue-500 text-white"
            onClick={(e) => {
              e.stopPropagation();
              alert('Comments button clicked!');
            }}
          >
            💬
          </button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="p-1 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              >
                <DotsVerticalIcon width="20" height="20" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="min-w-[150px] bg-white border rounded shadow p-1"
                sideOffset={5}
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenu.Item
                  className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                  onSelect={(e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(`${window.location.origin}/boards/${board.id}`);
                  }}
                >
                  Copy Link
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                  onSelect={(e) => {
                    e.preventDefault();
                    navigate(`/boards/${board.id}/edit`);
                  }}
                >
                  Edit
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="h-px bg-gray-200 my-1" />
                <DropdownMenu.Item
                  className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded text-red-600"
                  onSelect={(e) => {
                    e.preventDefault();
                    if (window.confirm("Are you sure you want to delete this board?")) {
                      console.log("Delete board here");
                    }
                  }}
                >
                  Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </div>
  );
}