import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface IconSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIcon: string;
  onSelect: (icon: string) => void;
}

const IconSelector: React.FC<IconSelectorProps> = ({
  isOpen,
  onClose,
  selectedIcon,
  onSelect,
}) => {
  const icons = ["🎨", "😀", "⭐", "🚀", "📌", "✅", "💡", "🔥", "🎯", "🌟"];

  const handleIconSelect = (icon: string) => {
    onSelect(icon);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Icon</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-5 gap-4 p-4">
          {icons.map((icon) => (
            <button
              key={icon}
              className={`text-3xl p-3 rounded-lg border-2 hover:bg-gray-100 transition-colors ${
                selectedIcon === icon ? "border-blue-500 bg-blue-50" : "border-gray-200"
              }`}
              onClick={() => handleIconSelect(icon)}
            >
              {icon}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default IconSelector;