'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { LayoutType } from '@/types/collabboard';
import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { createBoard } from '@/lib/collabboard/create/createBoard';
import { formatById } from './formatCatalog';
import FormatPicker from './FormatPicker';
import FormatStage from './FormatStage';
import StartWithChooser from './StartWithChooser';
import TemplateGalleryModal from './TemplateGalleryModal';
import BoardIconField from './BoardIconField';
import BoardBackgroundField from './BoardBackgroundField';

const DEFAULT_NAME = 'Untitled board';
const DEFAULT_ICON = 'lucide:layout';
const DEFAULT_BACKGROUND = '#ffffff';

type BackgroundType = 'color' | 'gradient' | 'image';

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[13px] font-semibold text-slate-800">{label}</div>
        <div className="text-xs text-slate-400">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-[22px] w-[38px] flex-none rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-slate-300'
        }`}
      >
        <span
          data-switch-knob
          className={`absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export default function NewBoardPage() {
  const router = useRouter();
  const [format, setFormat] = useState<LayoutType>('freeform');
  const [name, setName] = useState(DEFAULT_NAME);
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [background, setBackground] = useState<{ type: BackgroundType; value: string }>({
    type: 'color',
    value: DEFAULT_BACKGROUND,
  });
  const [comments, setComments] = useState(true);
  const [newPostsFirst, setNewPostsFirst] = useState(true);
  const [template, setTemplate] = useState<BoardTemplate | null>(null);
  const [hovered, setHovered] = useState<LayoutType | null>(null);
  const [picked, setPicked] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseFormat = (next: LayoutType) => {
    setFormat(next);
    setPicked(true);
    if (template && template.layout !== next) {
      if (name === template.name) setName(DEFAULT_NAME);
      setTemplate(null);
    }
  };

  const chooseBlank = () => {
    if (template && name === template.name) setName(DEFAULT_NAME);
    setTemplate(null);
  };

  const useTemplate = (next: BoardTemplate) => {
    const previous = template;
    if (name === DEFAULT_NAME || (previous && name === previous.name)) setName(next.name);
    setTemplate(next);
    setFormat(next.layout);
    setPicked(true);
    setGalleryOpen(false);
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    const result = await createBoard(supabaseBrowser(), {
      title: name,
      description,
      layout: format,
      background_type: background.type,
      background_value: background.value,
      comments_enabled: comments,
      new_posts_at_top: newPostsFirst,
      thumbnail: icon,
    });

    if (result.ok) {
      const query = template ? `?template=${template.id}` : '';
      router.push(`/dashboard/canvas/${result.boardId}${query}`);
      return;
    }

    setError(result.message);
    setSaving(false);
  };

  const formatName = formatById(format)?.name;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div
        data-new-board-bar
        className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3"
      >
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
          Dashboard
        </Link>
        <h1 className="border-l border-slate-200 pl-3 text-[15px] font-semibold text-slate-900">
          New board
        </h1>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_352px] max-[980px]:grid-cols-1">
        <main className="flex min-w-0 flex-col gap-7 px-7 pb-8 pt-6">
          <section>
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-xl font-semibold tracking-[-.01em] text-slate-900">
                What kind of board?
              </h2>
              <p className="text-slate-500">You can switch format later — your posts move with you.</p>
            </div>
            <div className="mt-4">
              <FormatPicker format={format} onSelect={chooseFormat} onHover={setHovered} />
            </div>
          </section>

          <section>
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-xl font-semibold tracking-[-.01em] text-slate-900">Start with</h2>
              <p className="text-slate-500">
                A blank {formatName} board, or one already filled in.
              </p>
            </div>
            <div className="mt-3.5">
              <StartWithChooser
                format={format}
                template={template}
                onChooseBlank={chooseBlank}
                onBrowseTemplates={() => setGalleryOpen(true)}
              />
            </div>
          </section>
        </main>

        <aside className="border-l border-slate-200 bg-slate-50 p-5 max-[980px]:border-l-0 max-[980px]:border-t">
          <div className="sticky top-4 flex flex-col gap-[18px]">
            <FormatStage
              format={format}
              hovered={hovered}
              picked={picked}
              templateName={template?.name ?? null}
            />

            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-slate-700">Name</span>
              <input
                data-board-name
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-[38px] w-full rounded-[9px] border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-slate-700">
                Description <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <textarea
                data-board-description
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What is this board for?"
                className="h-[60px] w-full resize-y rounded-[9px] border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-slate-700">Icon</span>
              <BoardIconField value={icon} onChange={setIcon} />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold text-slate-700">Background</span>
              <BoardBackgroundField
                value={background.value}
                type={background.type}
                onChange={(type, value) => setBackground({ type, value })}
              />
            </div>

            <div className="h-px bg-slate-200" />
            <ToggleRow
              label="Comments"
              description="People can comment on posts"
              checked={comments}
              onChange={setComments}
            />
            <ToggleRow
              label="New posts first"
              description="Newest posts appear at the top"
              checked={newPostsFirst}
              onChange={setNewPostsFirst}
            />
            <div className="h-px bg-slate-200" />

            <button
              type="button"
              data-create-board
              disabled={saving}
              onClick={handleCreate}
              className="h-[42px] w-full rounded-[9px] bg-blue-600 font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create board'}
            </button>
            {error ? (
              <p role="alert" className="text-xs text-red-600">
                {error}
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      <TemplateGalleryModal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        format={format}
        onUse={useTemplate}
      />
    </div>
  );
}
