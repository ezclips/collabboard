import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';

import { isGuestUser } from '@/lib/domain/auth/guest';
import { DECLARED_TYPES_FOR, EXTENSION_FOR, sniffUploadType } from '@/lib/domain/storage/uploadTypeSniff';
import { guestMay, recordGuestActivity } from '@/lib/server/sharing/guestPermissions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * PATCH-380. The ONE way a guest puts a file into storage.
 *
 * A guest NEVER writes to Storage directly: PATCH-358's `guest_no_storage_*`
 * restrictive policies stay exactly as they are, and this route is what makes
 * the owner's "Guests may upload" switch mean anything. It writes with the ADMIN
 * client, so the direct write stays refused while an allowed guest is served.
 *
 * FOUR GATES, in this order, all fail-closed:
 *   1. signed in, and ANONYMOUS -- a member has their own upload paths;
 *   2. `guestMay('upload')`: the owner's switch, the caller's editor rights on
 *      THIS board, and the per-guest cap;
 *   3. size, then TYPE: the magic bytes AND the declared type must agree on one
 *      of png/jpeg/gif/webp/pdf. An SVG or an HTML document is refused whatever
 *      it claims to be;
 *   4. the admin write, then one activity row.
 */

export const runtime = 'nodejs';

const BUCKET = 'padlet-files';
const MAX_BYTES = 10 * 1024 * 1024;
/**
 * The margin a multipart envelope (boundaries, the filename field, the
 * `Content-Type` part header) adds on top of the file itself. A `Content-Length`
 * larger than this can only be an oversized body or an attempt to make the
 * server buffer one, and either way it is refused BEFORE `formData()` reads a
 * byte into memory.
 */
const MAX_CONTENT_LENGTH = MAX_BYTES + 64 * 1024;

const ONE_FILE = { error: 'Send one file.', code: 'guest_upload_one_file' } as const;
const TOO_LARGE = { error: 'That file is too large (10 MB maximum).', code: 'guest_upload_too_large' } as const;
const BAD_TYPE = {
  error: 'Only PNG, JPEG, GIF, WEBP and PDF files can be uploaded.',
  code: 'guest_upload_type',
} as const;

/** The board id is a URL segment, so it is validated before any work happens. */
const boardIdSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: boardId } = await context.params;

  const cookieStore = await cookies();
  const sessionClient = createRouteHandlerClient({ cookies: () => cookieStore as never });
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // A malformed board id is refused before the permission read, the body, or
  // storage: there is no board to check against.
  if (!boardIdSchema.safeParse(boardId).success) {
    return NextResponse.json({ error: 'Invalid board id.' }, { status: 400 });
  }

  if (!isGuestUser(user)) {
    return NextResponse.json({ error: 'This route is for guests.', code: 'guest_upload_not_guest' }, { status: 403 });
  }

  // Refuse a body we already know is too large BEFORE buffering it. The check is
  // on the declared header only, so an absent or lying `Content-Length` still
  // reaches the file's own size check below -- this is a first line, not the
  // only one.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CONTENT_LENGTH) {
    return NextResponse.json(TOO_LARGE, { status: 413 });
  }

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Unavailable' }, { status: 500 });
  }

  // Fail closed: a permission read that throws is a 503, never an upload.
  try {
    const allowed = await guestMay({ admin, boardId, userId: user.id, kind: 'upload', now: new Date() });
    if (!allowed.ok) {
      return NextResponse.json(allowed.refusal.body, { status: allowed.refusal.status });
    }
  } catch (error) {
    console.error('Could not check guest upload permission:', error);
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(ONE_FILE, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(ONE_FILE, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(TOO_LARGE, { status: 413 });
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffUploadType(buffer);
  const declared = (file.type || '').toLowerCase();
  if (sniffed === null || !DECLARED_TYPES_FOR[sniffed].includes(declared)) {
    return NextResponse.json(BAD_TYPE, { status: 415 });
  }

  const path = `guest-uploads/${boardId}/${user.id}/${crypto.randomUUID()}.${EXTENSION_FOR[sniffed]}`;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: declared, upsert: false });
  if (uploadError) {
    console.error('Guest upload failed:', uploadError);
    return NextResponse.json({ error: 'Could not store the file.' }, { status: 500 });
  }

  const { data: publicUrl } = admin.storage.from(BUCKET).getPublicUrl(path);

  // Only now: the file is stored, so the cap may count it. Best effort.
  await recordGuestActivity(admin, { boardId, userId: user.id, kind: 'upload', now: new Date() });

  return NextResponse.json({ url: publicUrl.publicUrl });
}
