// 📄 app/collabboard/canvas/create/page.tsx
'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CanvasSetupPage from '../CanvasSetupPage';
import { CreateCanvasRequest } from '../../../../lib/collabboard/types';

export default function CreateCanvasPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSave = async (canvasData: CreateCanvasRequest) => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/collabboard/canvases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(canvasData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create canvas');
      }

      const { canvas } = await response.json();
      
      // Redirect to the new canvas
      router.push(`/collabboard/canvas/${canvas.id}`);
      
    } catch (error) {
      console.error('Error creating canvas:', error);
      alert(error instanceof Error ? error.message : 'Failed to create canvas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <CanvasSetupPage
      onSave={handleSave}
      isCreating={true}
      loading={loading}
    />
  );
}
