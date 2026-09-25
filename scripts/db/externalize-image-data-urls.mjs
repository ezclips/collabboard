// PATCH-182 follow-up -- the ONE-TIME move of pictures that older saves wrote into
// posts as `data:` URLs. New saves already store files (lib/infra/collabboard/
// imageEditStorage.ts); this moves what was saved before that.
//
// DRY RUN by default: it reads and reports, and writes NOTHING. Pass --apply to write.
//
//   node scripts/db/externalize-image-data-urls.mjs            # report only
//   node scripts/db/externalize-image-data-urls.mjs --apply    # move and rewrite
//
// The same rules as the save path, deliberately:
// - A picture cut from a Knowledge PDF (metadata.source.kind === 'knowledge-pdf-area')
//   goes ONLY to the private `knowledge-documents` bucket, at the path the edit route
//   uses (`board-derived/{board}/pdf-areas/{padlet}.{drawing|base}.png`), and the post
//   gets the board route that re-checks access on every read. Never a public bucket.
// - Any other picture goes to `padlet-files` under `image-edits/{board}/{padlet}/`.
// - A value that is not a PNG on a PDF-area post is reported and left alone (the
//   private route serves PNG only).
// - Library items are NOT touched: a PDF-area Library copy needs its own owner-scoped
//   address first (a follow-up). They are counted in the report.
//
// Idempotent: a post whose fields are already URLs has nothing to move.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const PRIVATE_BUCKET = 'knowledge-documents';
const PUBLIC_BUCKET = 'padlet-files';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readEnvLocal(name) {
  const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).replace(/^"|"$/g, '') : undefined;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || readEnvLocal('NEXT_PUBLIC_SUPABASE_URL');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || readEnvLocal('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const db = createClient(url, key, { auth: { persistSession: false } });

/** `data:image/{png|jpeg|webp};base64,...` decoded, or null. */
function decode(value) {
  if (typeof value !== 'string') return null;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  if (!match) return null;
  return { ext: match[1] === 'jpeg' ? 'jpg' : match[1], mimeType: `image/${match[1]}`, bytes: Buffer.from(match[2], 'base64') };
}

const isPdfArea = (metadata) => metadata?.source?.kind === 'knowledge-pdf-area';
const kb = (value) => `${Math.round(String(value).length / 1024)} kB`;

async function upload(bucket, objectPath, file) {
  const { error } = await db.storage.from(bucket).upload(objectPath, file.bytes, { contentType: file.mimeType, upsert: true });
  if (error) throw new Error(`upload ${bucket}/${objectPath}: ${error.message}`);
}

/** Where one field's picture goes, and the URL the post then holds. */
function destination(post, field, file) {
  const variant = field === 'drawing' ? 'drawing' : 'base';
  if (isPdfArea(post.metadata)) {
    if (file.mimeType !== 'image/png') return { skip: `PDF-area ${field} is ${file.mimeType}, not PNG` };
    if (!UUID.test(post.board_id) || !UUID.test(post.id)) return { skip: 'ids are not UUIDs' };
    return {
      bucket: PRIVATE_BUCKET,
      objectPath: `board-derived/${post.board_id}/pdf-areas/${post.id}.${variant}.png`,
      url: `/api/boards/${post.board_id}/padlets/${post.id}/image?variant=${variant}&v=${Date.now()}`,
    };
  }
  const objectPath = `image-edits/${post.board_id}/${post.id}/${field}-${Date.now()}.${file.ext}`;
  return { bucket: PUBLIC_BUCKET, objectPath, url: db.storage.from(PUBLIC_BUCKET).getPublicUrl(objectPath).data.publicUrl };
}

async function main() {
  const { data: posts, error } = await db
    .from('padlets')
    .select('id, board_id, file_url, metadata')
    .or('file_url.like.data:%,metadata->>drawing.like.data:%,metadata->>imageUrl.like.data:%,metadata->>originalImageUrl.like.data:%');
  if (error) throw new Error(`read padlets: ${error.message}`);

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${posts.length} post(s) hold a picture as text`);
  let moved = 0;
  for (const post of posts) {
    const metadata = { ...(post.metadata ?? {}) };
    const replaced = new Map(); // data URL -> stored URL, so file_url follows the field it duplicates
    const notes = [];
    // `originalImageUrl` is the pre-crop reset source. On a PDF-area post it has no
    // private variant of its own, so it is reported and left alone there.
    for (const field of ['drawing', 'imageUrl', 'originalImageUrl']) {
      const file = decode(metadata[field]);
      if (!file) continue;
      if (field === 'originalImageUrl' && isPdfArea(metadata)) { notes.push(`originalImageUrl ${kb(metadata[field])} left (no private variant)`); continue; }
      const target = destination(post, field, file);
      if (target.skip) { notes.push(`${field} left: ${target.skip}`); continue; }
      notes.push(`${field} ${kb(metadata[field])} -> ${target.bucket}/${target.objectPath}`);
      if (APPLY) await upload(target.bucket, target.objectPath, file);
      replaced.set(metadata[field], target.url);
      metadata[field] = target.url;
    }
    let fileUrl = post.file_url;
    if (typeof fileUrl === 'string' && fileUrl.startsWith('data:')) {
      const file = decode(fileUrl);
      const target = replaced.has(fileUrl) || !file ? null : destination(post, 'file', file);
      if (replaced.has(fileUrl)) { fileUrl = replaced.get(fileUrl); notes.push('file_url follows the same picture'); }
      else if (!file) notes.push(`file_url ${kb(fileUrl)} left: not a PNG, JPEG or WebP`);
      else if (target.skip || isPdfArea(post.metadata)) notes.push(`file_url ${kb(fileUrl)} left: ${target.skip ?? 'PDF-area file_url matches no variant'}`);
      else {
        notes.push(`file_url ${kb(fileUrl)} -> ${target.bucket}/${target.objectPath}`);
        if (APPLY) await upload(target.bucket, target.objectPath, file);
        replaced.set(fileUrl, target.url);
        fileUrl = target.url;
      }
    }
    console.log(`- ${post.id.slice(0, 8)} (${isPdfArea(post.metadata) ? 'PDF area, private' : 'ordinary, public'})\n    ${notes.join('\n    ')}`);
    if (replaced.size === 0) continue;
    if (APPLY) {
      const { error: writeError } = await db.from('padlets').update({ metadata, file_url: fileUrl }).eq('id', post.id);
      if (writeError) throw new Error(`update ${post.id}: ${writeError.message}`);
    }
    moved += 1;
  }

  const { count } = await db.from('library_items').select('id', { count: 'exact', head: true }).like('thumbnail_url', 'data:%');
  console.log(`${APPLY ? 'Rewrote' : 'Would rewrite'} ${moved} post(s). Library items holding a picture as text (not touched): ${count ?? 'unknown'}`);
}

main().catch((reason) => { console.error(reason instanceof Error ? reason.message : reason); process.exit(1); });
