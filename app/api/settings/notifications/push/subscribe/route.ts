import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

interface SubscribePayload {
  subscription?: {
    endpoint?: unknown;
    keys?: {
      p256dh?: unknown;
      auth?: unknown;
    };
  };
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

    const body = (await req.json()) as SubscribePayload;
    const endpoint =
      typeof body.subscription?.endpoint === 'string' ? body.subscription.endpoint : '';
    const p256dh =
      typeof body.subscription?.keys?.p256dh === 'string' ? body.subscription.keys.p256dh : '';
    const auth =
      typeof body.subscription?.keys?.auth === 'string' ? body.subscription.keys.auth : '';

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: 'Invalid payload. Expected subscription endpoint and keys.' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('notification_push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: req.headers.get('user-agent') || null,
        enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,endpoint' });

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Failed to save push subscription' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
