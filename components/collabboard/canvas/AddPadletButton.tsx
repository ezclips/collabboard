// components/collabboard/canvas/AddPadletButton.tsx
"use client";

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
// --- FIX: Importing types from the central file ---
import { Padlet } from '@/types/collabboard';
// --- END FIX ---

interface AddPadletButtonProps {
  onAddPadlet: (padletData: Partial<Padlet>) => void;
  layout: string;
}

export function AddPadletButton({ onAddPadlet, layout }: AddPadletButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onAddPadlet({
        title: title.trim(),
        content: content.trim(),
        width: 200,
        height: 150,
        position_x: 0,
        position_y: 0
      });
      
      // Reset form
      setTitle('');
      setContent('');
      setShowForm(false);
    }
  };

  const handleCancel = () => {
    setTitle('');
    setContent('');
    setShowForm(false);
  };

  // Don't show for freeform layout (uses double-click instead)
  if (layout === 'freeform') {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center z-40"
      >
        <Plus className="w-6 h-6" />
      </button>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">
                Add New Padlet
              </h3>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter padlet title..."
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={4}
                  placeholder="Enter content or description..."
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!title.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Add Padlet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
