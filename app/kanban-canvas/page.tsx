'use client';

import { KanbanProvider } from '@/components/kanban-canvas/store.tsx';
import { getMockData } from '@/components/kanban-canvas/mockData';
import { KanbanCanvas } from '@/components/kanban-canvas/KanbanCanvas';

import '@/components/kanban-canvas/kanban-canvas.css';

export default function KanbanCanvasPage() {
  const mockData = getMockData();

  return (
    <KanbanProvider canvasId="demo" initialData={mockData}>
      <div className="kanban-page h-screen">
        <div className="kanban-header">
          <h1>Kanban Canvas</h1>
          <p className="text-muted-foreground">Visual project management board</p>
        </div>

        <KanbanCanvas canvasId="demo" />
      </div>
    </KanbanProvider>
  );
}
