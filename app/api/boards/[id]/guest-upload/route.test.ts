// PATCH-380. The guest-upload route: the four gates, in order.
//
// `guestMay` is mocked, because its own suite covers the switch, the caller's
// rights and the cap. What is asserted HERE is the route's own behaviour: who it
// lets in, what it refuses, what it stores, and what it records.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
vi.mock('next/headers', () => ({ cookies: async () => ({}) }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: () => ({ auth: { getUser } }),
}));

const guestMay = vi.fn();
const recordGuestActivity = vi.fn();
vi.mock('@/lib/server/sharing/guestPermissions', () => ({
  guestMay: (...args: unknown[]) => guestMay(...args),
  recordGuestActivity: (...args: unknown[]) => recordGuestActivity(...args),
}));

const upload = vi.fn();
const getPublicUrl = vi.fn();
const getSupabaseAdmin = vi.fn(() => ({
  storage: { from: () => ({ upload, getPublicUrl }) },
}));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => getSupabaseAdmin() }));

import { POST } from './route';

const BOARD = 'f1000000-0000-4000-8000-0000000000b1';
const GUEST = { id: 'aaaaaaaa-0000-4000-8000-000000000001', is_anonymous: true };
const MEMBER = { id: 'bbbbbbbb-0000-4000-8000-000000000002', is_anonymous: false };

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const SVG = new Uint8Array([...'<svg xmlns="http://www.w3.org/2000/svg"/>'].map((c) => c.charCodeAt(0)));
const HTML = new Uint8Array([...'<!DOCTYPE html><html></html>'].map((c) => c.charCodeAt(0)));

const formDataCalls = { count: 0 };

function requestWith(
  file: File | null,
  { badForm = false, contentLength }: { badForm?: boolean; contentLength?: number } = {},
) {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-length' && contentLength !== undefined
          ? String(contentLength)
          : null,
    },
    formData: async () => {
      formDataCalls.count += 1;
      if (badForm) throw new Error('not multipart');
      const form = new FormData();
      if (file) form.set('file', file);
      return form;
    },
  } as unknown as Request;
}

const contextFor = (id: string) => ({ params: Promise.resolve({ id }) });
const call = (
  file: File | null,
  options?: { badForm?: boolean; id?: string; contentLength?: number },
) => POST(requestWith(file, options), contextFor(options?.id ?? BOARD));

beforeEach(() => {
  formDataCalls.count = 0;
  getUser.mockReset();
  guestMay.mockReset();
  recordGuestActivity.mockReset();
  upload.mockReset();
  getPublicUrl.mockReset();
  getUser.mockResolvedValue({ data: { user: GUEST }, error: null });
  guestMay.mockResolvedValue({ ok: true });
  upload.mockResolvedValue({ error: null });
  getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/x.png' } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PATCH-380 POST /api/boards/[id]/guest-upload', () => {
  it('refuses an unauthenticated caller', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await call(new File([PNG], 'a.png', { type: 'image/png' }));
    expect(response.status).toBe(401);
    expect(guestMay).not.toHaveBeenCalled();
  });

  it('refuses a member: this route is for guests', async () => {
    getUser.mockResolvedValue({ data: { user: MEMBER }, error: null });
    const response = await call(new File([PNG], 'a.png', { type: 'image/png' }));
    expect(response.status).toBe(403);
    expect(guestMay).not.toHaveBeenCalled();
  });

  it('refuses a malformed board id with 400 before the permission read or the body', async () => {
    const response = await call(new File([PNG], 'a.png', { type: 'image/png' }), { id: 'not-a-uuid' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid board id.' });
    expect(guestMay).not.toHaveBeenCalled();
    expect(formDataCalls.count).toBe(0);
  });

  it('refuses an oversized Content-Length with 413 BEFORE reading the body', async () => {
    const response = await call(new File([PNG], 'a.png', { type: 'image/png' }), {
      contentLength: 10 * 1024 * 1024 + 64 * 1024 + 1,
    });
    expect(response.status).toBe(413);
    // The whole point: no `request.formData()`, so the body is never buffered.
    expect(formDataCalls.count).toBe(0);
    expect(guestMay).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('accepts a body whose Content-Length is within the margin', async () => {
    // The file itself is tiny; only the declared header is near the limit, and
    // it is allowed through to the normal size and type gates.
    const response = await call(new File([PNG], 'a.png', { type: 'image/png' }), {
      contentLength: 10 * 1024 * 1024 + 64 * 1024,
    });
    expect(response.status).toBe(200);
    expect(formDataCalls.count).toBe(1);
  });

  it('refuses when the owner switch is off, with the guest refusal body', async () => {
    guestMay.mockResolvedValue({
      ok: false,
      refusal: { status: 403, body: { error: 'Create a free account to upload files.', code: 'guest_no_upload' } },
    });
    const response = await call(new File([PNG], 'a.png', { type: 'image/png' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Create a free account to upload files.', code: 'guest_no_upload' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses at the cap with 429', async () => {
    guestMay.mockResolvedValue({
      ok: false,
      refusal: { status: 429, body: { error: 'Guest limit reached. Please try again later.', code: 'guest_limit' } },
    });
    const response = await call(new File([PNG], 'a.png', { type: 'image/png' }));
    expect(response.status).toBe(429);
    expect(upload).not.toHaveBeenCalled();
  });

  it('answers 503 when the permission check throws -- never "allowed"', async () => {
    guestMay.mockRejectedValue(new Error('boom'));
    const response = await call(new File([PNG], 'a.png', { type: 'image/png' }));
    expect(response.status).toBe(503);
    expect(upload).not.toHaveBeenCalled();
  });

  it('accepts a PNG, stores it under the guest own folder, and records one row', async () => {
    const response = await call(new File([PNG], 'a.png', { type: 'image/png' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: 'https://cdn.test/x.png' });
    expect(upload).toHaveBeenCalledTimes(1);
    const [path, , options] = upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^guest-uploads/${BOARD}/${GUEST.id}/[0-9a-f-]{36}\\.png$`));
    expect(options).toEqual({ contentType: 'image/png', upsert: false });
    expect(recordGuestActivity).toHaveBeenCalledTimes(1);
    expect(recordGuestActivity.mock.calls[0][1]).toMatchObject({ boardId: BOARD, userId: GUEST.id, kind: 'upload' });
  });

  it('REFUSES an SVG even when it declares image/png', async () => {
    const response = await call(new File([SVG], 'a.png', { type: 'image/png' }));
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ code: 'guest_upload_type' });
    expect(upload).not.toHaveBeenCalled();
    expect(recordGuestActivity).not.toHaveBeenCalled();
  });

  it('REFUSES HTML', async () => {
    const response = await call(new File([HTML], 'a.png', { type: 'image/png' }));
    expect(response.status).toBe(415);
    expect(upload).not.toHaveBeenCalled();
  });

  it('REFUSES a real PNG that declares the wrong type', async () => {
    // Both halves must agree: the bytes say png, the claim says pdf.
    const response = await call(new File([PNG], 'a.pdf', { type: 'application/pdf' }));
    expect(response.status).toBe(415);
    expect(upload).not.toHaveBeenCalled();
  });

  it('accepts a PDF', async () => {
    const pdf = new Uint8Array([...'%PDF-1.7'].map((c) => c.charCodeAt(0)));
    getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.test/x.pdf' } });
    const response = await call(new File([pdf], 'a.pdf', { type: 'application/pdf' }));
    expect(response.status).toBe(200);
    expect(upload.mock.calls[0][0]).toMatch(/\.pdf$/);
  });

  it('refuses a file over 10 MB', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PNG, 0);
    const response = await call(new File([big], 'a.png', { type: 'image/png' }));
    expect(response.status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses a request that carries no file, and one that is not multipart', async () => {
    expect((await call(null)).status).toBe(400);
    expect((await call(null, { badForm: true })).status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });

  it('answers 500 and records nothing when the storage write fails', async () => {
    upload.mockResolvedValue({ error: { message: 'nope' } });
    const response = await call(new File([PNG], 'a.png', { type: 'image/png' }));
    expect(response.status).toBe(500);
    expect(recordGuestActivity).not.toHaveBeenCalled();
  });
});
