// 📄 app/collabboard/canvas/[id]/settings/page.tsx
'use client'

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import CanvasSetupPage from '../../CanvasSetupPage';
import { Canvas, CreateCanvasRequest, UpdateCanvasRequest } from '../../../../../lib/collabboard/types';

interface CanvasSettingsPageProps {
  params: Promise<{ id: string }>;
}

export default function CanvasSettingsPage({ params }: CanvasSettingsPageProps) {
  const { id } = use(params);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Fetch canvas data on mount
  useEffect(() => {
    const fetchCanvas = async () => {
      try {
        const response = await fetch(`/api/collabboard/canvases/${id}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch canvas');
        }

        const { canvas } = await response.json();
        setCanvas(canvas);
      } catch (error) {
        console.error('Error fetching canvas:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch canvas');
      } finally {
        setInitialLoading(false);
      }
    };

    fetchCanvas();
  }, [id]);

  const handleSave = async (canvasData: CreateCanvasRequest) => {
    setLoading(true);
    
    try {
      // For settings, we only update basic canvas info, not sections structure
      const updateData: UpdateCanvasRequest = {
        name: canvasData.name,
        category: canvasData.category,
        description: canvasData.description
      };

      const response = await fetch(`/api/collabboard/canvases/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update canvas');
      }

      const { canvas: updatedCanvas } = await response.json();
      setCanvas(updatedCanvas);
      
      // Redirect back to canvas
      router.push(`/collabboard/canvas/${id}`);
      
    } catch (error) {
      console.error('Error updating canvas:', error);
      alert(error instanceof Error ? error.message : 'Failed to update canvas');
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading canvas...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Canvas</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/collabboard')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Canvas not found
  if (!canvas) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 text-xl mb-4">🎨</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Canvas Not Found</h2>
          <p className="text-gray-600 mb-4">The canvas you're looking for doesn't exist or you don't have access to it.</p>
          <button
            onClick={() => router.push('/collabboard')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <CanvasSetupPage
      onSave={handleSave}
      isCreating={false}
      loading={loading}
      initialData={canvas}
    />
  );
}
