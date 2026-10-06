import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isBoardPdfUploadAvailable,
  openBoardPdfPicker,
  registerBoardPdfUploader,
  uploadBoardPdfs,
} from './boardUploadBridge';
import type { KnowledgePdfUploaderHandle } from '@/components/collabboard/KnowledgePdfUploader';

const pdf = (name = 'a.pdf') => new File(['x'], name, { type: 'application/pdf' });
const png = (name = 'a.png') => new File(['x'], name, { type: 'image/png' });

function handle(overrides: Partial<KnowledgePdfUploaderHandle> = {}): KnowledgePdfUploaderHandle {
  return { openPicker: vi.fn(), uploadFile: vi.fn(), ...overrides };
}

afterEach(() => registerBoardPdfUploader(null));

describe('boardUploadBridge', () => {
  it('reports unavailable and rejects every file with no handle', () => {
    expect(isBoardPdfUploadAvailable()).toBe(false);
    expect(uploadBoardPdfs([pdf(), png()])).toEqual({ accepted: 0, rejected: 2 });
  });

  it('forwards PDFs and counts non-PDFs as rejected', () => {
    const uploadFile = vi.fn();
    registerBoardPdfUploader(handle({ uploadFile }));
    expect(isBoardPdfUploadAvailable()).toBe(true);

    const result = uploadBoardPdfs([pdf('one.pdf'), png('two.png'), pdf('three.pdf')]);
    expect(result).toEqual({ accepted: 2, rejected: 1 });
    expect(uploadFile.mock.calls.map((call) => (call[0] as File).name)).toEqual(['one.pdf', 'three.pdf']);
  });

  it('accepts a .pdf by extension even when the mime type is missing', () => {
    const uploadFile = vi.fn();
    registerBoardPdfUploader(handle({ uploadFile }));
    expect(uploadBoardPdfs([new File(['x'], 'scan.PDF')])).toEqual({ accepted: 1, rejected: 0 });
  });

  it('opens the picker through the registered handle', () => {
    const openPicker = vi.fn();
    registerBoardPdfUploader(handle({ openPicker }));
    openBoardPdfPicker();
    expect(openPicker).toHaveBeenCalledTimes(1);
  });

  it('unregisters on null', () => {
    registerBoardPdfUploader(handle());
    registerBoardPdfUploader(null);
    expect(isBoardPdfUploadAvailable()).toBe(false);
    expect(uploadBoardPdfs([pdf()])).toEqual({ accepted: 0, rejected: 1 });
  });
});
