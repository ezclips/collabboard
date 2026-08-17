'use client';

import React, { useCallback, useRef, useState } from 'react';
import DrawingLayout from '@/components/collabboard/canvas/layouts/DrawingLayout';
import type { Padlet } from '@/types/collabboard';

const container = {
  id: 'container-fixture', board_id: 'local-fixture', type: 'container', title: 'Fixture Container',
  content: '[]', position_x: 180, position_y: 160, width: 500, height: 280,
  created_at: '', updated_at: '',
  metadata: { isContainer: true, orientation: 'vertical', childPadletIds: ['child-fixture', 'child-wide-fixture'] },
} as unknown as Padlet;
const child = {
  id: 'child-fixture', board_id: 'local-fixture', type: 'text', title: 'Fixture child',
  content: 'Child content', position_x: 0, position_y: 0, width: 180, height: 120,
  created_at: '', updated_at: '', metadata: { parentId: 'container-fixture' },
} as unknown as Padlet;
const childWide = {
  id: 'child-wide-fixture', board_id: 'local-fixture', type: 'text', title: 'Wide fixture child',
  content: 'Wide child content', position_x: 0, position_y: 0, width: 300, height: 120,
  created_at: '', updated_at: '', metadata: { parentId: 'container-fixture' },
} as unknown as Padlet;
const neighbor = {
  id: 'neighbor-fixture', board_id: 'local-fixture', type: 'text', title: 'Neighbor post',
  content: 'Neighbor content', position_x: 700, position_y: 250, width: 320, height: 180,
  created_at: '', updated_at: '', metadata: {},
} as unknown as Padlet;

export default function DrawingResizeFixture() {
  const [padlets, setPadlets] = useState<Padlet[]>([container, child, childWide, neighbor]);
  const apiRef = useRef<any>(null);
  const failNextRef = useRef(false);
  const writesRef = useRef<Array<{ id: string; updates: Partial<Padlet>; strict: boolean }>>([]);

  const applyUpdate = useCallback((id: string, updates: Partial<Padlet>) => {
    setPadlets((current) => current.map((padlet) => padlet.id === id ? { ...padlet, ...updates } : padlet));
  }, []);
  const onUpdatePadlet = useCallback(async (id: string, updates: Partial<Padlet>) => {
    writesRef.current.push({ id, updates, strict: false });
    applyUpdate(id, updates);
  }, [applyUpdate]);
  const onUpdatePadletStrict = useCallback(async (id: string, updates: Partial<Padlet>) => {
    writesRef.current.push({ id, updates, strict: true });
    if (failNextRef.current) {
      failNextRef.current = false;
      throw new Error('local fixture rejection');
    }
    applyUpdate(id, updates);
  }, [applyUpdate]);

  React.useEffect(() => {
    (window as any).__drawingResizeFixture = {
      apiRef,
      failNext: () => { failNextRef.current = true; },
      writes: () => [...writesRef.current],
      clearWrites: () => { writesRef.current = []; },
      updateContainer: (updates: Partial<Padlet>) => applyUpdate(container.id, updates),
      updateChild: (id: string, updates: Partial<Padlet>) => applyUpdate(id, updates),
      removeChild: (id: string) => setPadlets((current) => current
        .filter((padlet) => padlet.id !== id)
        .map((padlet) => padlet.id === container.id ? {
          ...padlet,
          metadata: {
            ...padlet.metadata,
            childPadletIds: ((padlet.metadata as any)?.childPadletIds ?? []).filter((childId: string) => childId !== id),
          },
        } : padlet)),
      getPadlets: () => padlets,
    };
    return () => { delete (window as any).__drawingResizeFixture; };
  }, [applyUpdate, padlets]);

  return (
    <main style={{ position: 'fixed', inset: 0 }}>
      <DrawingLayout
        canvasId="local-fixture"
        padlets={padlets}
        canvasLines={[]}
        padletsLoaded
        onAddPadlet={async () => null}
        onUpdatePadlet={onUpdatePadlet}
        onUpdatePadletStrict={onUpdatePadletStrict}
        drawingExcalidrawAPIRef={apiRef}
      />
    </main>
  );
}
