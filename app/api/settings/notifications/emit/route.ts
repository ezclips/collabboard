import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAllowedNotificationChannels } from '@/lib/notifications/server';
import { dispatchNotification } from '@/lib/notifications/dispatch';

export const runtime = 'nodejs';

type SupportedEmitEvent = 'account_changes' | 'security_alerts';

interface EmitPayload {
  eventId?: unknown;
  context?: unknown;
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

function isSupportedEvent(value: unknown): value is SupportedEmitEvent {
  return value === 'account_changes' || value === 'security_alerts';
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as EmitPayload;
    if (!isSupportedEvent(body.eventId)) {
      return NextResponse.json(
        { error: 'Invalid eventId. Expected "account_changes" or "security_alerts".' },
        { status: 400 }
      );
    }

    const context =
      body.context && typeof body.context === 'object'
        ? (body.context as Record<string, unknown>)
        : {};

    const supabase = makeAuthedClient(token);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData.user;
    if (authError || !user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedChannels = await getAllowedNotificationChannels(
      supabase,
      user.id,
      body.eventId,
      ['email', 'push']
    );

    if (allowedChannels.length === 0) {
      return NextResponse.json({ success: true, eventId: body.eventId, allowed: false, results: [] });
    }

    const profileEmail = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .maybeSingle();
    const recipientEmail =
      user.email ||
      (typeof profileEmail.data?.email === 'string' ? profileEmail.data.email : null);

    const results = await dispatchNotification({
      eventId: body.eventId,
      recipientUserId: user.id,
      channels: allowedChannels,
      recipientEmail,
      context: {
        ...context,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin,
      },
    });

    return NextResponse.json({
      success: true,
      eventId: body.eventId,
      allowed: true,
      channels: allowedChannels,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
