import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createOAuthState, resolveProvider } from '../oauth';

export const runtime = 'nodejs';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

function makeAuthedClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = makeAuthedClient(token);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const userId = authData.user?.id;
    if (authError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const provider = resolveProvider(typeof body?.provider === 'string' ? body.provider : null);
    if (!provider) {
      return NextResponse.json({ error: 'Unsupported integration provider.' }, { status: 400 });
    }

    if (!provider.clientId || !provider.clientSecret) {
      const envHint =
        provider.id === 'google-drive'
          ? 'Missing GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET'
          : 'Missing MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET';
      return NextResponse.json(
        { error: `${provider.label} OAuth is not configured on the server. ${envHint}` },
        { status: 501 }
      );
    }

    const callbackUrl = new URL(`/api/settings/integrations/callback/${provider.id}`, req.nextUrl.origin);

    const state = createOAuthState(userId, provider.id);
    const authUrl = new URL(provider.authUrl);
    authUrl.searchParams.set('client_id', provider.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', callbackUrl.toString());
    authUrl.searchParams.set('scope', provider.scope);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('prompt', 'consent');

    for (const [key, value] of Object.entries(provider.extraAuthParams || {})) {
      authUrl.searchParams.set(key, value);
    }

    return NextResponse.json({ url: authUrl.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
