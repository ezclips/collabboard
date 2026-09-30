// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The component imports a CSS file; vitest's PostCSS cannot process it here, and
// the test is about behaviour, not styling.
vi.mock('react-image-crop/dist/ReactCrop.css', () => ({}));

import ImageEditor from './ImageEditor';

/**
 * PATCH-216. In import mode a supported file offers "Link to the original"
 * (default) or "Add as a readable document", and the latter calls
 * `onImportAsDocument` WITHOUT `onSave`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement | null = null;

function mount(props: Partial<React.ComponentProps<typeof ImageEditor>> = {}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const onSave = props.onSave ?? vi.fn();
  act(() => {
    root!.render(
      <ImageEditor
        isOpen
        onClose={props.onClose ?? vi.fn()}
        onSave={onSave}
        onImportAsDocument={props.onImportAsDocument}
        initialData={props.initialData}
      />,
    );
  });
  return { container, onSave };
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/**
 * A mount whose props can be re-rendered, so a parent's inline `initialData`
 * (a fresh object every render) can be reproduced exactly.
 */
function mountFull(props: Partial<React.ComponentProps<typeof ImageEditor>> = {}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const onSave = props.onSave ?? vi.fn();
  const render = (initialData: React.ComponentProps<typeof ImageEditor>['initialData'], isOpen = true) => {
    act(() => {
      root!.render(
        <ImageEditor
          isOpen={isOpen}
          onClose={props.onClose ?? vi.fn()}
          onSave={onSave}
          onImportAsDocument={props.onImportAsDocument}
          initialData={initialData}
        />,
      );
    });
  };
  render(props.initialData);
  return { container, onSave, rerender: render };
}

const PDF_IMPORT = {
  source: 'import' as const,
  imageUrl: 'https://preview.example/x.png',
  importData: {
    provider: 'google-drive' as const,
    itemId: 'FILEID1234567890',
    openUrl: 'https://drive.google.com/file/d/FILEID1234567890/view',
    mimeType: 'application/pdf',
    fileName: 'report.pdf',
    kind: 'document' as const,
  },
};

const IMAGE_IMPORT = {
  ...PDF_IMPORT,
  importData: { ...PDF_IMPORT.importData, mimeType: 'image/png', fileName: 'photo.png', kind: 'image' as const },
};

function choiceRadio(label: 'link' | 'document') {
  return document.getElementById(`import-choice-${label}`) as HTMLInputElement | null;
}

function buttonByText(text: string) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement | undefined;
}

describe('ImageEditor import-as-document choice', () => {
  it('the choice appears for a PDF, in import mode, with the prop', () => {
    mount({ initialData: PDF_IMPORT, onImportAsDocument: vi.fn() });
    expect(choiceRadio('link')).not.toBeNull();
    expect(choiceRadio('document')).not.toBeNull();
    expect(choiceRadio('link')!.checked).toBe(true);
  });

  it('is absent for an image, even with the prop', () => {
    mount({ initialData: IMAGE_IMPORT, onImportAsDocument: vi.fn() });
    expect(choiceRadio('link')).toBeNull();
  });

  it('is absent without the prop', () => {
    mount({ initialData: PDF_IMPORT });
    expect(choiceRadio('link')).toBeNull();
  });

  it('the default link choice saving calls onSave', () => {
    const { onSave } = mount({ initialData: PDF_IMPORT, onImportAsDocument: vi.fn() });
    act(() => { buttonByText('Add to Canvas')!.click(); });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('choosing "readable document" changes the label and calls onImportAsDocument, NOT onSave', () => {
    const onImportAsDocument = vi.fn();
    const onClose = vi.fn();
    const { onSave } = mount({ initialData: PDF_IMPORT, onImportAsDocument, onClose });

    act(() => {
      choiceRadio('document')!.click();
    });
    const addButton = buttonByText('Add as document');
    expect(addButton).toBeTruthy();

    act(() => { addButton!.click(); });
    expect(onImportAsDocument).toHaveBeenCalledWith(PDF_IMPORT.importData);
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('REGRESSION: a parent re-render with a new-but-equal initialData does not reset the choice', () => {
    const onImportAsDocument = vi.fn();
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { rerender } = mountFull({ initialData: PDF_IMPORT, onImportAsDocument, onSave, onClose });

    // Choose "Add as a readable document".
    act(() => { choiceRadio('document')!.click(); });
    expect(buttonByText('Add as document')).toBeTruthy();

    // CanvasModals rebuilds initialData inline every render. Re-render with a
    // NEW object carrying the SAME values.
    act(() => {
      rerender({
        ...PDF_IMPORT,
        importData: { ...PDF_IMPORT.importData },
      });
    });

    // The choice SURVIVED the re-render.
    expect(choiceRadio('document')!.checked).toBe(true);
    const addButton = buttonByText('Add as document');
    expect(addButton).toBeTruthy();

    act(() => { addButton!.click(); });
    expect(onImportAsDocument).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('reopening the dialog starts on "Link" again', () => {
    const { rerender } = mountFull({ initialData: PDF_IMPORT, onImportAsDocument: vi.fn() });

    act(() => { choiceRadio('document')!.click(); });
    expect(choiceRadio('document')!.checked).toBe(true);

    // Close, then reopen with the same item.
    act(() => { rerender(PDF_IMPORT, false); });
    act(() => { rerender({ ...PDF_IMPORT, importData: { ...PDF_IMPORT.importData } }, true); });

    expect(choiceRadio('link')!.checked).toBe(true);
  });
});
