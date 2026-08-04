// @vitest-environment jsdom
import fs from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorContent, useSharedTipTapEditor } from './useSharedTipTapEditor';
import { toEditorHtml } from '@/lib/domain/canvas/documentContentAdapter';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => {
      m.root.unmount();
    });
    m.container.remove();
  }
  mounted = [];
});

function Harness(props: {
  initialContent?: string;
  editable?: boolean;
  onUpdate?: (html: string) => void;
  onEditor?: (editor: NonNullable<ReturnType<typeof useSharedTipTapEditor>>) => void;
}) {
  const editor = useSharedTipTapEditor(props);
  if (editor) props.onEditor?.(editor);
  if (!editor) return null;
  return <EditorContent editor={editor} />;
}

describe('useSharedTipTapEditor (PATCH-149B1a)', () => {
  it('mounts with initial HTML content', () => {
    const container = mount(<Harness initialContent="<p>Legacy note</p>" />);
    expect(container.textContent).toContain('Legacy note');
    expect(container.querySelector('.ProseMirror')).not.toBeNull();
  });

  it('mounts with adapter-produced plain-text HTML', () => {
    const html = toEditorHtml('a bare < angle > fixture');
    const container = mount(<Harness initialContent={html} />);
    expect(container.textContent).toContain('a bare < angle > fixture');
  });

  it('is editable when editable=true (default)', () => {
    const container = mount(<Harness initialContent="<p>edit me</p>" editable />);
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    expect(pm.getAttribute('contenteditable')).toBe('true');
  });

  it('is non-editable when editable=false', () => {
    const container = mount(<Harness initialContent="<p>locked</p>" editable={false} />);
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    expect(pm.getAttribute('contenteditable')).toBe('false');
  });

  it('empty content initializes safely', () => {
    const container = mount(<Harness initialContent="" />);
    expect(container.querySelector('.ProseMirror')).not.toBeNull();
  });

  it('shared extensions are present (underline mark registered)', () => {
    const src = fs.readFileSync('components/collabboard/editors/useSharedTipTapEditor.ts', 'utf8');
    expect(src).toContain('Underline');
    expect(src).toContain('SHARED_TIPTAP_EXTENSIONS');
  });

  it('preserves the shared registry as the single extension seam', () => {
    const hookSrc = fs.readFileSync('components/collabboard/editors/useSharedTipTapEditor.ts', 'utf8');
    const noteSrc = fs.readFileSync('components/collabboard/editors/NoteEditor.tsx', 'utf8');
    expect((hookSrc.match(/export const SHARED_TIPTAP_EXTENSIONS/g) || []).length).toBe(1);
    expect(noteSrc).not.toContain('NOTE_EXTENSIONS');
    expect(noteSrc).not.toMatch(/const \w*_EXTENSIONS\s*=\s*\[/);
  });

  it('round-trips a custom extension attribute (Comment data-comment-id) through getHTML', () => {
    const html = '<span data-comment-id="c1" class="comment-mark">hi</span>';
    const container = mount(<Harness initialContent={html} />);
    expect(container.innerHTML).toContain('data-comment-id="c1"');
  });

  it('onUpdate receives serialized HTML on content change', () => {
    const onUpdate = vi.fn();
    let liveEditor: NonNullable<ReturnType<typeof useSharedTipTapEditor>> | null = null;
    mount(
      <Harness
        initialContent="<p>start</p>"
        onUpdate={onUpdate}
        onEditor={(e) => { liveEditor = e; }}
      />,
    );
    act(() => {
      liveEditor!.chain().focus().insertContent(' more').run();
    });
    expect(onUpdate).toHaveBeenCalled();
    expect(onUpdate.mock.calls.at(-1)![0]).toContain('more');
  });
});
