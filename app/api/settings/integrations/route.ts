import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PROVIDER_IDS, type IntegrationProvider } from './oauth';

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

export async function GET(req: NextRequest) {
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

    const { data, error } = await supabase
      .from('user_integrations')
      .select('provider, email')
      .eq('user_id', userId);

    if (error) {
      return NextResponse.json({ error: error.message || 'Failed to load integrations' }, { status: 500 });
    }

    const byProvider = new Map<string, { provider: string; email: string | null }>();
    for (const row of data || []) {
      byProvider.set(row.provider, { provider: row.provider, email: row.email ?? null });
    }

    const integrations = (PROVIDER_IDS as IntegrationProvider[]).map((provider) => {
      const connected = byProvider.get(provider);
      return {
        provider,
        connected: !!connected,
        email: connected?.email ?? null,
      };
    });

    return NextResponse.json({ integrations });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
