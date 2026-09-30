// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The component imports a CSS file; vitest's PostCSS cannot process it here, and
// the test is about behaviour, not styling.
vi.mock('react-image-crop/dist/ReactCrop.css', () => ({}));

// PATCH-218. The upload is stored through this one helper; the editor's job is
// to call it and use its URL, so it is mocked here.
const storage = vi.hoisted(() => ({ storeUploadedImage: vi.fn() }));
vi.mock('@/lib/infra/collabboard/imageEditStorage', () => ({
  storeUploadedImage: storage.storeUploadedImage,
}));

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
        defaultTab={props.defaultTab}
        boardId={props.boardId}
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

// PATCH-217. The two image-window tab labels.
describe('ImageEditor tab labels', () => {
  it('reads "Free images" and "Upload your own"', () => {
    mount({});
    expect(buttonByText('Free images')).toBeTruthy();
    expect(buttonByText('Upload your own')).toBeTruthy();
    expect(buttonByText('Search Pexels')).toBeUndefined();
    expect(buttonByText('Upload File')).toBeUndefined();
  });

  it('defaultTab="upload" still opens the upload tab', () => {
    // The upload panel is the only one showing "Upload from your device".
    mount({ defaultTab: 'upload' as never });
    expect(document.body.textContent).toContain('Upload from your device');
  });
});

// PATCH-218. An uploaded image is stored as a file, and drag and drop works.
describe('PATCH-218 upload tab', () => {
  const BOARD = '11111111-1111-4111-8111-111111111111';
  const dropZone = () =>
    document.querySelector('[data-image-dropzone="true"]') as HTMLElement | null;
  const chooseInput = () =>
    document.getElementById('file-upload') as HTMLInputElement | null;

  function giveFile(input: HTMLInputElement, file: File) {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  }

  const png = () => new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });

  beforeEach(() => {
    storage.storeUploadedImage.mockReset();
    // jsdom implements createObjectURL/revokeObjectURL.
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = vi.fn(() => 'blob:preview');
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = vi.fn();
  });

  it('choosing a PNG previews it with a blob: URL, not a data URL', () => {
    mount({ boardId: BOARD, defaultTab: 'upload' as never });
    giveFile(chooseInput()!, png());
    const img = document.querySelector('img[alt="Import preview"], .border-dashed img') as HTMLImageElement | null;
    // The preview lives in the tab panel; assert the src that got set.
    expect(document.body.innerHTML).toContain('blob:preview');
    expect(document.body.innerHTML).not.toContain('data:image');
    expect(img === null || !img.src.startsWith('data:')).toBe(true);
  });

  it('"Add Image" stores the file and saves the storage URL, never data:', async () => {
    storage.storeUploadedImage.mockResolvedValue({ ok: true, url: 'https://cdn.example/u/photo.png' });
    const onSave = vi.fn();
    mount({ boardId: BOARD, defaultTab: 'upload' as never, onSave });
    giveFile(chooseInput()!, png());

    await act(async () => { buttonByText('Add Image')!.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(storage.storeUploadedImage).toHaveBeenCalledTimes(1);
    const call = storage.storeUploadedImage.mock.calls[0][0] as { boardId: string; file: File };
    expect(call.boardId).toBe(BOARD);
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as { imageUrl: string; source: string };
    expect(saved.imageUrl).toBe('https://cdn.example/u/photo.png');
    expect(saved.imageUrl.startsWith('data:')).toBe(false);
    expect(saved.source).toBe('upload');
  });

  it('an upload failure shows the message, does NOT save, and keeps the dialog open', async () => {
    storage.storeUploadedImage.mockResolvedValue({ ok: false, message: 'Could not upload the image. Please try again.' });
    const onSave = vi.fn();
    const onClose = vi.fn();
    mount({ boardId: BOARD, defaultTab: 'upload' as never, onSave, onClose });
    giveFile(chooseInput()!, png());

    await act(async () => { buttonByText('Add Image')!.click(); });
    await act(async () => { await Promise.resolve(); });

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Could not upload the image. Please try again.');
    expect(document.querySelector('[data-ui="image-editor-modal"]')).not.toBeNull();
  });

  it('a missing boardId shows a message and does not save', async () => {
    const onSave = vi.fn();
    mount({ defaultTab: 'upload' as never, onSave });
    giveFile(chooseInput()!, png());

    await act(async () => { buttonByText('Add Image')!.click(); });

    expect(storage.storeUploadedImage).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Could not upload the image.');
  });

  it('dropping an image file previews it like choosing it', () => {
    mount({ boardId: BOARD, defaultTab: 'upload' as never });
    const zone = dropZone()!;
    const file = png();
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
    act(() => { zone.dispatchEvent(event); });
    expect(document.body.innerHTML).toContain('blob:preview');
  });

  it('a non-image dropped file shows the inline message and no preview', () => {
    mount({ boardId: BOARD, defaultTab: 'upload' as never });
    const zone = dropZone()!;
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
    act(() => { zone.dispatchEvent(event); });
    expect(document.body.textContent).toContain('Please choose an image file.');
    expect(document.body.innerHTML).not.toContain('blob:preview');
  });

  it('an oversize file shows the tooLarge message and no preview', () => {
    mount({ boardId: BOARD, defaultTab: 'upload' as never });
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    giveFile(chooseInput()!, big);
    expect(document.body.textContent).toContain('The limit for images is 20.0 MB.');
    expect(document.body.innerHTML).not.toContain('blob:preview');
  });
});
