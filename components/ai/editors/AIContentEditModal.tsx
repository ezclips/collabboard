'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';

import AIContentRenderer from '@/components/ai/AIContentRenderer';
import type {
  AIContentData,
  BarChartDiagramData,
  ChartDataPoint,
  ComparisonColumn,
  LessonBoardData,
  LessonBoardSection,
  LoadedAIContent,
  PhotoCardData,
  PieChartDiagramData,
  StoredAIContent,
  TimelineDiagramData,
  TimelineItem,
  WorkshopBoardBlock,
  WorkshopBoardData,
} from '@/lib/ai/contracts';
import { serializeAIContentForPersistence } from '@/lib/ai/persistence';
import {
  trackAIEditOpened,
  trackAIEditSaved,
  trackAIEditValidationFailed,
} from '@/lib/ai/telemetry';
import { safeValidateAIContentWithSubtypeCheck } from '@/lib/ai/validators';
import { renderDiagramCode } from '@/lib/ai/diagram-engine';

export interface AIContentEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  envelope: StoredAIContent;
  initialPrompt?: string;
  onSave: (data: { aiPrompt: string; aiComponentJson: LoadedAIContent }) => void;
}

// ── Shared input helpers ───────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 ${className ?? ''}`}
    />
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300"
    />
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600"
    >
      <Plus className="h-3 w-3" />
      {label}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
      title="Remove"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

// ── Code diagram editor (flowchart / mindmap) ──────────────────────────────────

type DiagramRenderPhase = { phase: 'idle' } | { phase: 'loading' } | { phase: 'done'; svg: string } | { phase: 'failed' };

function CodeDiagramEditor({
  title,
  code,
  onTitleChange,
  onCodeChange,
  renderPhase,
}: {
  title: string;
  code: string;
  onTitleChange: (v: string) => void;
  onCodeChange: (v: string) => void;
  renderPhase: DiagramRenderPhase;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <FieldLabel>Title</FieldLabel>
        <TextInput value={title} onChange={onTitleChange} placeholder="Diagram title" />
      </div>
      <div className="space-y-1">
        <FieldLabel>Diagram code</FieldLabel>
        <TextArea value={code} onChange={onCodeChange} rows={14} placeholder="flowchart LR\n  A --> B" />
        {renderPhase.phase === 'failed' && (
          <p className="text-xs text-red-500">Diagram code has a syntax error — fix it before saving.</p>
        )}
        {renderPhase.phase === 'loading' && (
          <p className="text-xs text-gray-400">Checking diagram syntax…</p>
        )}
      </div>
    </div>
  );
}

// ── Chart data-point editor (pie / bar) ───────────────────────────────────────

function ChartEditor({
  data,
  onDataChange,
}: {
  data: PieChartDiagramData | BarChartDiagramData;
  onDataChange: (next: PieChartDiagramData | BarChartDiagramData) => void;
}) {
  const isPie = data.subtype === 'pie_chart';

  const setTitle = (title: string) => onDataChange({ ...data, title });
  const setPoints = (dataPoints: ChartDataPoint[]) => onDataChange({ ...data, dataPoints } as typeof data);
  const setXLabel = (xLabel: string) => onDataChange({ ...(data as BarChartDiagramData), xLabel });
  const setYLabel = (yLabel: string) => onDataChange({ ...(data as BarChartDiagramData), yLabel });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <FieldLabel>Title</FieldLabel>
        <TextInput value={data.title} onChange={setTitle} placeholder="Chart title" />
      </div>

      {!isPie && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <FieldLabel>X axis label</FieldLabel>
            <TextInput
              value={(data as BarChartDiagramData).xLabel ?? ''}
              onChange={setXLabel}
              placeholder="optional"
            />
          </div>
          <div className="space-y-1">
            <FieldLabel>Y axis label</FieldLabel>
            <TextInput
              value={(data as BarChartDiagramData).yLabel ?? ''}
              onChange={setYLabel}
              placeholder="optional"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <FieldLabel>Data points</FieldLabel>
        {data.dataPoints.map((pt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={pt.label}
              onChange={(e) => {
                const next = [...data.dataPoints];
                next[i] = { ...next[i], label: e.target.value };
                setPoints(next);
              }}
              placeholder="Label"
              className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <input
              type="number"
              value={pt.value}
              min={isPie ? 0.01 : 0}
              onChange={(e) => {
                const next = [...data.dataPoints];
                next[i] = { ...next[i], value: Number(e.target.value) };
                setPoints(next);
              }}
              placeholder="Value"
              className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <RemoveButton
              onClick={() => setPoints(data.dataPoints.filter((_, j) => j !== i))}
            />
          </div>
        ))}
        <AddButton
          label="Add data point"
          onClick={() => setPoints([...data.dataPoints, { label: '', value: 0 }])}
        />
      </div>
    </div>
  );
}

// ── Timeline editor ────────────────────────────────────────────────────────────

function TimelineEditor({
  data,
  onDataChange,
}: {
  data: TimelineDiagramData;
  onDataChange: (next: TimelineDiagramData) => void;
}) {
  const setItems = (items: TimelineItem[]) => onDataChange({ ...data, items });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <FieldLabel>Title</FieldLabel>
        <TextInput value={data.title} onChange={(v) => onDataChange({ ...data, title: v })} />
      </div>
      <div className="space-y-3">
        <FieldLabel>Items</FieldLabel>
        {data.items.map((item, i) => (
          <div key={i} className="space-y-1.5 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-start gap-2">
              <input
                type="text"
                value={item.title}
                onChange={(e) => {
                  const next = [...data.items];
                  next[i] = { ...next[i], title: e.target.value };
                  setItems(next);
                }}
                placeholder="Event title"
                className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
              <RemoveButton onClick={() => setItems(data.items.filter((_, j) => j !== i))} />
            </div>
            <input
              type="text"
              value={item.dateLabel ?? ''}
              onChange={(e) => {
                const next = [...data.items];
                next[i] = { ...next[i], dateLabel: e.target.value || undefined };
                setItems(next);
              }}
              placeholder="Date label (optional)"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
            <textarea
              value={item.description ?? ''}
              onChange={(e) => {
                const next = [...data.items];
                next[i] = { ...next[i], description: e.target.value || undefined };
                setItems(next);
              }}
              placeholder="Description (optional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>
        ))}
        <AddButton
          label="Add item"
          onClick={() => setItems([...data.items, { title: '' }])}
        />
      </div>
    </div>
  );
}

// ── Comparison editor ──────────────────────────────────────────────────────────

function ComparisonEditor({
  data,
  onDataChange,
}: {
  data: { title: string; columns: ComparisonColumn[] };
  onDataChange: (next: { title: string; columns: ComparisonColumn[] }) => void;
}) {
  const setColumns = (columns: ComparisonColumn[]) => onDataChange({ ...data, columns });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <FieldLabel>Title</FieldLabel>
        <TextInput value={data.title} onChange={(v) => onDataChange({ ...data, title: v })} />
      </div>
      <div className="space-y-3">
        <FieldLabel>Columns (min 2)</FieldLabel>
        {data.columns.map((col, ci) => (
          <div key={ci} className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={col.heading}
                onChange={(e) => {
                  const next = [...data.columns];
                  next[ci] = { ...next[ci], heading: e.target.value };
                  setColumns(next);
                }}
                placeholder="Column heading"
                className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium outline-none focus:border-indigo-400"
              />
              {data.columns.length > 2 && (
                <RemoveButton onClick={() => setColumns(data.columns.filter((_, j) => j !== ci))} />
              )}
            </div>
            {col.points.map((pt, pi) => (
              <div key={pi} className="flex items-center gap-2">
                <input
                  type="text"
                  value={pt}
                  onChange={(e) => {
                    const next = [...data.columns];
                    const nextPoints = [...next[ci].points];
                    nextPoints[pi] = e.target.value;
                    next[ci] = { ...next[ci], points: nextPoints };
                    setColumns(next);
                  }}
                  placeholder="Point"
                  className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
                />
                <RemoveButton
                  onClick={() => {
                    const next = [...data.columns];
                    next[ci] = { ...next[ci], points: next[ci].points.filter((_, j) => j !== pi) };
                    setColumns(next);
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const next = [...data.columns];
                next[ci] = { ...next[ci], points: [...next[ci].points, ''] };
                setColumns(next);
              }}
              className="text-xs text-indigo-500 hover:underline"
            >
              + Add point
            </button>
          </div>
        ))}
        <AddButton
          label="Add column"
          onClick={() => setColumns([...data.columns, { heading: '', points: [''] }])}
        />
      </div>
    </div>
  );
}

// ── Lesson board editor ────────────────────────────────────────────────────────

function LessonBoardEditor({
  data,
  onDataChange,
}: {
  data: LessonBoardData;
  onDataChange: (next: LessonBoardData) => void;
}) {
  const setSections = (sections: LessonBoardSection[]) => onDataChange({ ...data, sections });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <FieldLabel>Title</FieldLabel>
        <TextInput value={data.title} onChange={(v) => onDataChange({ ...data, title: v })} />
      </div>
      <div className="space-y-1">
        <FieldLabel>Objective (optional)</FieldLabel>
        <TextInput
          value={data.objective ?? ''}
          onChange={(v) => onDataChange({ ...data, objective: v || undefined })}
          placeholder="Learning objective"
        />
      </div>
      <div className="space-y-3">
        <FieldLabel>Sections</FieldLabel>
        {data.sections.map((sec, si) => (
          <div key={si} className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={sec.title}
                onChange={(e) => {
                  const next = [...data.sections];
                  next[si] = { ...next[si], title: e.target.value };
                  setSections(next);
                }}
                placeholder="Section title"
                className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium outline-none focus:border-indigo-400"
              />
              {data.sections.length > 1 && (
                <RemoveButton onClick={() => setSections(data.sections.filter((_, j) => j !== si))} />
              )}
            </div>
            {(sec.bullets ?? []).map((b, bi) => (
              <div key={bi} className="flex items-center gap-2">
                <input
                  type="text"
                  value={b}
                  onChange={(e) => {
                    const next = [...data.sections];
                    const nextBullets = [...(next[si].bullets ?? [])];
                    nextBullets[bi] = e.target.value;
                    next[si] = { ...next[si], bullets: nextBullets };
                    setSections(next);
                  }}
                  placeholder="Bullet point"
                  className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
                />
                <RemoveButton
                  onClick={() => {
                    const next = [...data.sections];
                    next[si] = { ...next[si], bullets: (next[si].bullets ?? []).filter((_, j) => j !== bi) };
                    setSections(next);
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const next = [...data.sections];
                next[si] = { ...next[si], bullets: [...(next[si].bullets ?? []), ''] };
                setSections(next);
              }}
              className="text-xs text-indigo-500 hover:underline"
            >
              + Add bullet
            </button>
          </div>
        ))}
        <AddButton
          label="Add section"
          onClick={() => setSections([...data.sections, { title: '' }])}
        />
      </div>
    </div>
  );
}

// ── Workshop board editor ──────────────────────────────────────────────────────

function WorkshopBoardEditor({
  data,
  onDataChange,
}: {
  data: WorkshopBoardData;
  onDataChange: (next: WorkshopBoardData) => void;
}) {
  const setBlocks = (blocks: WorkshopBoardBlock[]) => onDataChange({ ...data, blocks });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <FieldLabel>Title</FieldLabel>
        <TextInput value={data.title} onChange={(v) => onDataChange({ ...data, title: v })} />
      </div>
      <div className="space-y-3">
        <FieldLabel>Blocks</FieldLabel>
        {data.blocks.map((block, bi) => (
          <div key={bi} className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={block.title}
                onChange={(e) => {
                  const next = [...data.blocks];
                  next[bi] = { ...next[bi], title: e.target.value };
                  setBlocks(next);
                }}
                placeholder="Block title"
                className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm font-medium outline-none focus:border-indigo-400"
              />
              {data.blocks.length > 1 && (
                <RemoveButton onClick={() => setBlocks(data.blocks.filter((_, j) => j !== bi))} />
              )}
            </div>
            <textarea
              value={block.description ?? ''}
              onChange={(e) => {
                const next = [...data.blocks];
                next[bi] = { ...next[bi], description: e.target.value || undefined };
                setBlocks(next);
              }}
              placeholder="Description (optional)"
              rows={2}
              className="w-full resize-none rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
            />
          </div>
        ))}
        <AddButton
          label="Add block"
          onClick={() => setBlocks([...data.blocks, { title: '' }])}
        />
      </div>
    </div>
  );
}

// ── Photo card editor ──────────────────────────────────────────────────────────

function PhotoCardEditor({
  data,
  onDataChange,
}: {
  data: PhotoCardData;
  onDataChange: (next: PhotoCardData) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <FieldLabel>Title</FieldLabel>
        <TextInput value={data.title} onChange={(v) => onDataChange({ ...data, title: v })} />
      </div>
      <div className="space-y-1">
        <FieldLabel>Caption (optional)</FieldLabel>
        <TextInput
          value={data.caption ?? ''}
          onChange={(v) => onDataChange({ ...data, caption: v || undefined })}
          placeholder="Photo caption"
        />
      </div>
      <div className="space-y-1">
        <FieldLabel>Image search query</FieldLabel>
        <TextInput
          value={data.image.query}
          onChange={(v) =>
            onDataChange({ ...data, image: { query: v, url: data.image.url } })
          }
          placeholder="e.g. mountain landscape"
        />
        <p className="text-xs text-gray-400">
          The resolved image URL is kept as-is. Regenerate the card to pick up a new image.
        </p>
      </div>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────

function buildDraftEnvelope(
  original: StoredAIContent,
  draftData: AIContentData,
): StoredAIContent {
  return { ...original, data: draftData };
}

function getSubtypeForData(data: AIContentData): string | undefined {
  return data.type === 'diagram' ? data.subtype : undefined;
}

export default function AIContentEditModal({
  isOpen,
  onClose,
  envelope,
  initialPrompt = '',
  onSave,
}: AIContentEditModalProps) {
  const [draftData, setDraftData] = useState<AIContentData>(envelope.data);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [diagramRenderPhase, setDiagramRenderPhase] = useState<DiagramRenderPhase>({ phase: 'idle' });

  // Debounce ref for diagram code preview
  const diagramDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal opens with new envelope
  useEffect(() => {
    if (!isOpen) return;
    setDraftData(envelope.data);
    setPrompt(initialPrompt);
    setValidationError(null);
    setDiagramRenderPhase({ phase: 'idle' });

    trackAIEditOpened({
      mode: envelope.mode,
      subtype: getSubtypeForData(envelope.data),
    });
  // Only reset when the modal opens or envelope identity changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Trigger diagram preview render with debounce
  const scheduleDiagramPreview = useCallback((code: string) => {
    if (diagramDebounceRef.current) clearTimeout(diagramDebounceRef.current);

    if (!code.trim()) {
      setDiagramRenderPhase({ phase: 'idle' });
      return;
    }

    setDiagramRenderPhase({ phase: 'loading' });
    diagramDebounceRef.current = setTimeout(async () => {
      const result = await renderDiagramCode(code);
      setDiagramRenderPhase(result.ok ? { phase: 'done', svg: result.svg } : { phase: 'failed' });
    }, 500);
  }, []);

  // When draft data changes for a code diagram, schedule a preview render
  useEffect(() => {
    if (
      draftData.type === 'diagram' &&
      (draftData.subtype === 'flowchart' || draftData.subtype === 'mindmap')
    ) {
      scheduleDiagramPreview(draftData.code);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftData.type === 'diagram' &&
    (draftData.subtype === 'flowchart' || draftData.subtype === 'mindmap')
      ? (draftData as { code: string }).code
      : null,
  ]);

  const handleSave = () => {
    const subtype = draftData.type === 'diagram' ? draftData.subtype : undefined;
    const validation = safeValidateAIContentWithSubtypeCheck({
      mode: envelope.mode,
      subtype,
      data: draftData,
    });

    if (!validation.success) {
      const reason = 'error' in validation ? validation.error.message : 'Validation failed';
      setValidationError(reason);
      trackAIEditValidationFailed({
        mode: envelope.mode,
        subtype: getSubtypeForData(draftData),
        reason,
      });
      return;
    }

    const draftEnvelope = buildDraftEnvelope(envelope, draftData);
    const persisted = serializeAIContentForPersistence(draftEnvelope);
    if (!persisted) {
      setValidationError('Could not serialize the edited content. Please check all required fields.');
      return;
    }

    trackAIEditSaved({ mode: envelope.mode, subtype: getSubtypeForData(draftData) });
    onSave({ aiPrompt: prompt, aiComponentJson: persisted });
    onClose();
  };

  if (!isOpen) return null;

  const draftEnvelope = buildDraftEnvelope(envelope, draftData);
  const subtypeLabel = getSubtypeForData(draftData);
  const modeLabel = envelope.mode.replace('_', ' ');
  const contentTypeLabel = subtypeLabel
    ? subtypeLabel.replace('_', ' ')
    : modeLabel;

  // Determine if the diagram render phase has a syntax error (block save for code diagrams)
  const isDiagramCodeType =
    draftData.type === 'diagram' &&
    (draftData.subtype === 'flowchart' || draftData.subtype === 'mindmap');
  const diagramHasSyntaxError = isDiagramCodeType && diagramRenderPhase.phase === 'failed';

  function renderFormFields() {
    if (draftData.type === 'diagram') {
      const sub = draftData.subtype;
      if (sub === 'flowchart' || sub === 'mindmap') {
        return (
          <CodeDiagramEditor
            title={draftData.title}
            code={draftData.code}
            onTitleChange={(v) => setDraftData({ ...draftData, title: v })}
            onCodeChange={(v) => setDraftData({ ...draftData, code: v })}
            renderPhase={diagramRenderPhase}
          />
        );
      }
      if (sub === 'pie_chart' || sub === 'bar_chart') {
        return (
          <ChartEditor
            data={draftData}
            onDataChange={(next) => setDraftData(next as AIContentData)}
          />
        );
      }
      if (sub === 'timeline') {
        return (
          <TimelineEditor
            data={draftData}
            onDataChange={(next) => setDraftData(next as AIContentData)}
          />
        );
      }
      if (sub === 'comparison') {
        return (
          <ComparisonEditor
            data={{ title: draftData.title, columns: draftData.columns }}
            onDataChange={({ title, columns }) =>
              setDraftData({ ...draftData, title, columns } as AIContentData)
            }
          />
        );
      }
    }

    if (draftData.type === 'lesson_board') {
      return <LessonBoardEditor data={draftData} onDataChange={(next) => setDraftData(next)} />;
    }

    if (draftData.type === 'workshop_board') {
      return <WorkshopBoardEditor data={draftData} onDataChange={(next) => setDraftData(next)} />;
    }

    if (draftData.type === 'photo') {
      return <PhotoCardEditor data={draftData} onDataChange={(next) => setDraftData(next)} />;
    }

    return <p className="text-sm text-gray-400">This content type has no editable fields.</p>;
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-[1020px] max-w-[96vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-gray-50/50 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Edit AI Component</h2>
            <p className="mt-0.5 text-xs capitalize text-gray-500">{contentTypeLabel}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-gray-200">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: form */}
          <div className="w-[380px] shrink-0 overflow-y-auto border-r bg-gray-50/30 p-6">
            <div className="space-y-6">
              {renderFormFields()}

              {validationError && (
                <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                  <p className="text-xs text-red-600">{validationError}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: live preview */}
          <div className="flex flex-1 flex-col overflow-hidden bg-white p-6">
            <p className="block text-sm font-medium text-gray-700">Live preview</p>
            <div className="relative mt-4 flex-1 overflow-auto rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-4 shadow-inner">
              <AIContentRenderer content={draftEnvelope} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl px-6 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={diagramHasSyntaxError}
            className={`flex items-center gap-2 rounded-xl px-8 py-2.5 text-sm font-medium transition-all ${
              diagramHasSyntaxError
                ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95'
            }`}
          >
            <Save className="h-4 w-4" />
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
