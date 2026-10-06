// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  available: vi.fn(),
  open: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@/lib/collabboard/boardUploadBridge', () => ({
  isBoardPdfUploadAvailable: () => hoisted.available(),
  openBoardPdfPicker: () => hoisted.open(),
  uploadBoardPdfs: (files: File[]) => hoisted.upload(files),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import ResearchDropZone from './ResearchDropZone';
import { toast } from 'sonner';

let root: Root | null = null;
let host: HTMLElement;

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
const pdf = (name = 'a.pdf') => new File(['x'], name, { type: 'application/pdf' });
const png = (name = 'a.png') => new File(['x'], name, { type: 'image/png' });

async function mount(title = 'Upload your research') {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ResearchDropZone title={title} />);
  });
  return host;
}

const zone = () => host.querySelector('[data-research-drop-zone]') as HTMLElement;

async function dropFiles(files: File[]) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  await act(async () => {
    zone().dispatchEvent(event);
  });
}

beforeEach(() => {
  hoisted.available.mockReset().mockReturnValue(true);
  hoisted.open.mockReset();
  hoisted.upload.mockReset().mockImplementation((files: File[]) => {
    const accepted = files.filter(isPdf).length;
    return { accepted, rejected: files.length - accepted };
  });
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  host?.remove();
});

describe('ResearchDropZone', () => {
  it('shows the title, the instructions and the picker button when uploading is available', async () => {
    await mount();
    expect(zone()).not.toBeNull();
    expect(zone().textContent).toContain('Upload your research');
    expect(zone().textContent).toContain('Drop a PDF here or choose a file.');
    expect(zone().querySelector('button')?.textContent).toContain('Choose a PDF');
  });

  it('opens the PDF picker from the button', async () => {
    await mount();
    await act(async () => {
      (zone().querySelector('button') as HTMLButtonElement).click();
    });
    expect(hoisted.open).toHaveBeenCalledTimes(1);
  });

  it('keeps the picker button out of the card drag system', async () => {
    await mount();
    const button = zone().querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('data-no-drag')).toBe('true');

    const parentPointerDown = vi.fn();
    document.addEventListener('pointerdown', parentPointerDown);
    await act(async () => {
      button.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    });
    document.removeEventListener('pointerdown', parentPointerDown);
    expect(parentPointerDown).not.toHaveBeenCalled();
  });

  it('forwards one PDF and one PNG, then shows the error toast', async () => {
    await mount();
    await dropFiles([pdf('paper.pdf'), png('photo.png')]);

    expect(hoisted.upload).toHaveBeenCalledTimes(1);
    expect((hoisted.upload.mock.calls[0][0] as File[]).map((file) => file.name)).toEqual([
      'paper.pdf',
      'photo.png',
    ]);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Only PDF files can be added here.');
  });

  it('does not show the error toast when every file is a PDF', async () => {
    await mount();
    await dropFiles([pdf('one.pdf'), pdf('two.pdf')]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('hides the button and shows the viewer text when uploading is unavailable', async () => {
    hoisted.available.mockReturnValue(false);
    await mount();
    expect(zone().querySelector('button')).toBeNull();
    expect(zone().textContent).toContain("PDFs added by the board's editors appear here.");
    expect(zone().textContent).not.toContain('Choose a PDF');
  });

  it('stops a drop from propagating to the page', async () => {
    await mount();
    const documentDrop = vi.fn();
    document.addEventListener('drop', documentDrop);
    await dropFiles([pdf('paper.pdf')]);
    document.removeEventListener('drop', documentDrop);
    expect(documentDrop).not.toHaveBeenCalled();
  });
});
