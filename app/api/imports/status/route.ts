// GET /api/imports/status?provider=google-drive|microsoft-onedrive
// Returns whether the current user has a connected integration for the provider.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/imports/auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { ImportProvider } from '@/lib/imports/types';

export const runtime = 'nodejs';

const VALID_PROVIDERS: ImportProvider[] = ['google-drive', 'microsoft-onedrive'];

export async function GET(req: NextRequest) {
  const auth = await getAuthenticatedUserId(req);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const provider = req.nextUrl.searchParams.get('provider') as ImportProvider | null;
  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  // Use the admin client so RLS never blocks this server-side read.
  // Auth is already verified above via the user's JWT.
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('user_integrations')
    .select('email')
    .eq('user_id', auth.userId)
    .eq('provider', provider)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    provider,
    connected: !!data,
    email: data?.email ?? null,
  });
}
