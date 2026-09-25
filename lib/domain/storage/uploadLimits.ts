/**
 * PATCH-180. The upload size limits, in ONE pure module.
 *
 * WHY THEY EXIST: a board could be filled with multi-hundred-megabyte files.
 * Storage has no quota, and every uploaded PDF also starts the server-side
 * extraction worker, so an unbounded upload costs real money.
 *
 * WHERE EACH LIMIT BITES. A browser upload (a post image or file, an avatar)
 * goes straight from the browser to the Storage bucket and never passes the app
 * server, so the BUCKET's own `file_size_limit` (set by the migration beside
 * this module) is the enforcement that cannot be bypassed. The checks here exist
 * to give the user a clear message EARLY, and -- for the Knowledge upload, which
 * DOES pass the server -- to stop the server reading a huge body into memory.
 *
 * NUMBERS ONLY. This module decides nothing about HTTP, React or Supabase.
 */

/** One mebibyte, the unit Storage reports sizes in. */
export const MB = 1024 * 1024;

/** One gibibyte. PATCH-184: the first plan limit to reach GB. */
const GB = 1024 * MB;

/**
 * The limits, as decided by the owner.
 *
 * `knowledgePdf` matches `KNOWLEDGE_DERIVATIVE_MAX_SOURCE_BYTES`: a PDF larger
 * than this could never have its pages rendered anyway, so accepting one would
 * store a document the reader cannot show.
 */
export const UPLOAD_LIMITS = {
  knowledgePdf: 50 * MB,
  /** .docx / .md / .txt sources. */
  knowledgeText: 20 * MB,
  /** Post images. */
  image: 20 * MB,
  /** Any other post file. */
  file: 50 * MB,
  avatar: 5 * MB,
} as const;

/** How many Knowledge files one user may add per rolling hour. */
export const KNOWLEDGE_UPLOADS_PER_HOUR = 30;

/**
 * "1.5 GB" / "72.4 MB" / "850 KB": one decimal above a kilobyte, and a whole
 * gigabyte loses its trailing ".0" ("1 GB", not "1.0 GB").
 *
 * Sizes are shown to a person deciding what to do about a refusal, so the unit
 * is chosen to keep the number short: whole kilobytes below a megabyte, and one
 * decimal above it, because "72 MB" and "72.4 MB" are the same decision but the
 * second says the file really was measured.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 KB';
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(1).replace(/\.0$/, '')} GB`;
}

/** The user-facing refusal, naming the file's size and the limit it broke. */
export function tooLargeMessage(sizeBytes: number, limitBytes: number, kindLabel: string): string {
  return `This file is ${formatBytes(sizeBytes)}. The limit for ${kindLabel} is ${formatBytes(limitBytes)}.`;
}

/**
 * PATCH-185. The refusal when the PLAN's own size limit -- not the server's
 * technical cap -- is what the file broke, so the sentence can name the plan
 * and point at an upgrade.
 */
export function planLimitMessage(sizeBytes: number, limitBytes: number, planName: string): string {
  return `This file is ${formatBytes(sizeBytes)}. The limit on the ${planName} plan is ${formatBytes(limitBytes)}. Upgrade for larger files.`;
}

/**
 * Which browser-upload limit applies to a bucket + MIME type.
 *
 * `null` means THIS PATCH SETS NO LIMIT for that combination -- an unknown
 * bucket, or one whose files are not bounded here -- and the gateway's behaviour
 * is then exactly what it was before: pass the file through untouched.
 */
export function browserUploadLimit(bucket: string, mimeType: string): number | null {
  if (bucket === 'avatars') return UPLOAD_LIMITS.avatar;
  if (bucket === 'padlet-files') {
    return mimeType.startsWith('image/') ? UPLOAD_LIMITS.image : UPLOAD_LIMITS.file;
  }
  return null;
}

/** The label `tooLargeMessage` names for a browser bucket + MIME type. */
export function browserUploadKindLabel(bucket: string, mimeType: string): string {
  if (bucket === 'avatars') return 'profile pictures';
  if (bucket === 'padlet-files' && mimeType.startsWith('image/')) return 'images';
  return 'files';
}
