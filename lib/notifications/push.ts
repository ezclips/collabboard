import webpush from 'web-push';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

type PushSendResult = {
  sent: number;
  failed: number;
};

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    throw new Error('VAPID_NOT_CONFIGURED');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export function isPushConfigured() {
  return Boolean(
    process.env.VAPID_SUBJECT &&
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushSendResult> {
  if (!isPushConfigured()) {
    return { sent: 0, failed: 0 };
  }

  ensureVapidConfigured();
  const admin = getSupabaseAdmin();
  const { data: subscriptions, error } = await admin
    .from('notification_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('enabled', true);

  if (error || !subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const serialized = JSON.stringify(payload);

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        serialized
      );
      sent += 1;
    } catch {
      failed += 1;
      // Mark failed subscription inactive to avoid repeated send attempts.
      await admin
        .from('notification_push_subscriptions')
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq('id', subscription.id);
    }
  }

  return { sent, failed };
}
