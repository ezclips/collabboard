'use client';

import React from 'react';

import type { DrawnDiagramData } from '@/lib/ai/contracts';
import type { DrawnPicture } from '@/lib/ai/drawn/format';
import { sceneFromStored } from '@/lib/ai/drawn/stored';
import { sceneToSvg } from '@/lib/ai/drawn/toSvg';
import { trackAIRenderFallback } from '@/lib/ai/telemetry';

import { DrawnEditContext, DrawnElementPanel } from './DrawnElementPanel';
import { usePictureSidePanel } from './PictureSidePanel';
import UnsupportedAIContent from './UnsupportedAIContent';

/**
 * PATCH-284/285. Renders an AI-drawn picture. In editable mode a click on an
 * element selects it (the selected node gets `data-drawn-selected`), a click on
 * the ground selects the picture itself (`null`), and one `DrawnElementPanel`
 * per object edits it. Not editable -> no handlers, unchanged look.
 *
 * `sceneToSvg` escapes every text run AND every id, and only emits
 * `data:image/svg+xml` hrefs it built itself, so injecting the string is safe.
 */
export interface DrawnPictureRendererProps {
  data: DrawnDiagramData;
  /** Forces editability (the Edit window). Omitted -> the gallery context decides. */
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Direct wiring (Edit window); the gallery supplies these through `DrawnEditContext`. */
  basePicture?: DrawnPicture;
  onChange?: (picture: DrawnPicture) => void;
}

function DrawnPictureRenderer({
  data,
  editable,
  selectedId: selectedIdProp,
  onSelect,
  basePicture,
  onChange,
}: DrawnPictureRendererProps) {
  let svg: string | null = null;
  try {
    svg = sceneToSvg(sceneFromStored(data));
  } catch {
    svg = null;
  }

  const rootRef = React.useRef<HTMLDivElement>(null);
  const sidePanel = usePictureSidePanel();
  const editCtx = React.useContext(DrawnEditContext);
  const [internalSelected, setInternalSelected] = React.useState<string | null | undefined>(undefined);
  const selected = selectedIdProp !== undefined ? selectedIdProp : internalSelected;
  // The gallery renders this renderer once per option (tiles, hover layer and
  // the selected preview); only the selected preview may edit.
  const [inSelectedLayer, setInSelectedLayer] = React.useState(editable === true);
  React.useEffect(() => {
    if (editable !== undefined) return;
    setInSelectedLayer(Boolean(rootRef.current?.closest('[data-ai-preview-selected-layer]')));
  }, [editable, svg]);

  const inSelectedLayerAllowed = Boolean(editCtx && (!editCtx.scopeToSelectedLayer || inSelectedLayer));
  const canEdit = editable !== undefined ? editable : Boolean(editCtx?.enabled && inSelectedLayerAllowed);
  const commit = canEdit
    ? onChange ?? (editCtx ? (next: DrawnPicture) => editCtx.onChange(data, next) : undefined)
    : undefined;
  const base = basePicture ?? editCtx?.baseFor(data) ?? data.picture;

  const select = (id: string | null) => {
    if (selectedIdProp === undefined) setInternalSelected(id);
    onSelect?.(id);
  };

  const setElementPanelOpen = sidePanel?.setElementPanelOpen;
  React.useEffect(() => {
    if (!canEdit) return;
    setElementPanelOpen?.(selected !== undefined);
  }, [canEdit, selected, setElementPanelOpen]);
  React.useEffect(() => {
    if (!canEdit) return;
    return () => {
      setElementPanelOpen?.(false);
    };
  }, [canEdit, setElementPanelOpen]);

  // The picture is injected as a string, so the selection highlight is applied
  // to the live node after each render.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll('[data-drawn-selected]').forEach((node) => {
      node.removeAttribute('data-drawn-selected');
      (node as SVGElement).style.outline = '';
      (node as SVGElement).style.outlineOffset = '';
    });
    if (typeof selected === 'string') {
      const match = Array.from(root.querySelectorAll('[data-drawn-id]')).find(
        (node) => node.getAttribute('data-drawn-id') === selected,
      );
      if (match) {
        match.setAttribute('data-drawn-selected', 'true');
        (match as SVGElement).style.outline = '2px solid #2563eb';
        (match as SVGElement).style.outlineOffset = '1px';
      }
    }
  }, [selected, svg]);

  if (!svg) {
    trackAIRenderFallback({ renderer: 'drawn', subtype: 'drawn', reason: 'invalid_picture' });
    return <UnsupportedAIContent message="This drawn picture could not be displayed." />;
  }

  const onClick = canEdit
    ? (event: React.MouseEvent<HTMLDivElement>) => {
        const node = (event.target as Element).closest('[data-drawn-id]');
        select(node?.getAttribute('data-drawn-id') ?? null);
      }
    : undefined;

  const panel =
    canEdit && commit && selected !== undefined ? (
      <DrawnElementPanel
        picture={data.picture}
        basePicture={base}
        outline={data.outline}
        kind={data.kind}
        selectedId={selected}
        onChange={commit}
        onSelect={select}
        onClose={() => {
          if (selectedIdProp === undefined) setInternalSelected(undefined);
          onSelect?.(null);
        }}
      />
    ) : null;

  return (
    <>
      <div
        ref={rootRef}
        data-ai-drawn="true"
        onClick={onClick}
        className={`w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full ${canEdit ? 'cursor-pointer' : ''}`}
        style={{ aspectRatio: `${data.picture.width} / ${data.picture.height}` }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {panel}
    </>
  );
}

export default React.memo(DrawnPictureRenderer);
