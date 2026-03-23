import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  NotificationChannel,
  SUPPORTED_NOTIFICATION_EVENT_IDS,
} from '@/lib/notifications/preferences';
import { getAllowedNotificationChannels } from '@/lib/notifications/server';

export const runtime = 'nodejs';

interface CheckPayload {
  eventId?: unknown;
  channel?: unknown;
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

function isValidChannel(value: unknown): value is NotificationChannel {
  return value === 'push' || value === 'email';
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as CheckPayload;
    const eventId = typeof body.eventId === 'string' ? body.eventId : '';
    const channel = body.channel;

    if (!eventId || !isValidChannel(channel)) {
      return NextResponse.json(
        { error: 'Invalid payload. Expected eventId:string and channel:"push"|"email".' },
        { status: 400 }
      );
    }

    if (!SUPPORTED_NOTIFICATION_EVENT_IDS.includes(eventId)) {
      return NextResponse.json(
        { error: 'Unsupported notification event', eventId },
        { status: 400 }
      );
    }

    const supabase = makeAuthedClient(token);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const userId = authData.user?.id;
    if (authError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedChannels = await getAllowedNotificationChannels(supabase, userId, eventId, [channel]);
    const allowed = allowedChannels.includes(channel);

    return NextResponse.json({
      eventId,
      channel,
      allowed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
