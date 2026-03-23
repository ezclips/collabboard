import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type NotificationChannel,
  type NotificationSettingsMap,
  normalizeNotificationSettings,
  isNotificationEnabled,
  SUPPORTED_NOTIFICATION_EVENT_IDS,
} from '@/lib/notifications/preferences';

export async function loadUserNotificationSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<NotificationSettingsMap> {
  const { data, error } = await supabase
    .from('notification_settings')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to load notification settings');
  }

  return normalizeNotificationSettings(data?.settings);
}

export async function getAllowedNotificationChannels(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  requestedChannels: NotificationChannel[]
): Promise<NotificationChannel[]> {
  if (!SUPPORTED_NOTIFICATION_EVENT_IDS.includes(eventId)) {
    return [];
  }

  const uniqueChannels = [...new Set(requestedChannels)] as NotificationChannel[];
  if (uniqueChannels.length === 0) {
    return [];
  }

  const settings = await loadUserNotificationSettings(supabase, userId);
  return uniqueChannels.filter((channel) => isNotificationEnabled(settings, eventId, channel));
}
