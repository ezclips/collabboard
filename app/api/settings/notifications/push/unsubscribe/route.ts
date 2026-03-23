import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

interface UnsubscribePayload {
  endpoint?: unknown;
}

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

    const body = (await req.json()) as UnsubscribePayload;
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint) {
      return NextResponse.json({ error: 'Invalid payload. Expected endpoint.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('notification_push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Failed to remove push subscription' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
