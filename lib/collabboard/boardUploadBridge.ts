import type { KnowledgePdfUploaderHandle } from '@/components/collabboard/KnowledgePdfUploader';

/**
 * PATCH-302. The connection between a PDF drop zone rendered inside a board
 * post and the ONE Knowledge uploader the toolbar mounts. React state cannot
 * carry a handle from a sibling subtree, so this small module-level registry
 * does: the toolbar registers its uploader, the drop zone asks for it. No
 * React, no network -- only the handle and a file check.
 */
let handle: KnowledgePdfUploaderHandle | null = null;

/** Register the mounted uploader, or `null` to unregister it on unmount. */
export function registerBoardPdfUploader(next: KnowledgePdfUploaderHandle | null): void {
  handle = next;
}

export function isBoardPdfUploadAvailable(): boolean {
  return handle !== null;
}

export function openBoardPdfPicker(): void {
  handle?.openPicker();
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/**
 * Forward every PDF to the registered uploader through the SAME `uploadFile`
 * a picked file uses; count files it cannot take. Without an uploader nothing
 * can be accepted, so every file is rejected.
 */
export function uploadBoardPdfs(files: File[]): { accepted: number; rejected: number } {
  let accepted = 0;
  let rejected = 0;
  for (const file of files) {
    if (handle === null || !isPdf(file)) {
      rejected += 1;
      continue;
    }
    handle.uploadFile(file);
    accepted += 1;
  }
  return { accepted, rejected };
}
