export type NotificationChannel = 'push' | 'email';
export type NotificationTab = 'general' | 'scenes' | 'accounts';

export interface NotificationSetting {
  id: string;
  label: string;
  description: string;
  push: boolean;
  email: boolean;
}

export interface NotificationCategory {
  title: string;
  settings: NotificationSetting[];
}

export type NotificationSettingsMap = Record<NotificationTab, NotificationCategory[]>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsMap = {
  general: [
    {
      title: 'Updates',
      settings: [
        {
          id: 'product_updates',
          label: 'Product updates',
          description: 'Updates about what has changed in CollabBoard.',
          push: false,
          email: false,
        },
      ],
    },
    {
      title: 'Activity',
      settings: [
        {
          id: 'invitation_collaborate',
          label: 'Invitation to collaborate',
          description: 'You are invited to be a collaborator on a scene.',
          push: false,
          email: true,
        },
        {
          id: 'comments_posts',
          label: 'Comments on your posts',
          description: "A comment is added to a post you've written.",
          push: true,
          email: false,
        },
        {
          id: 'reactions_posts',
          label: 'Reactions on your posts',
          description: "A reaction is added to a post you've written.",
          push: false,
          email: false,
        },
      ],
    },
  ],
  scenes: [
    {
      title: 'Scene notifications',
      settings: [
        {
          id: 'scene_new_post',
          label: 'New post',
          description: 'Someone adds a new post to a scene you follow.',
          push: true,
          email: false,
        },
        {
          id: 'scene_new_comment',
          label: 'New comment',
          description: 'Someone comments on a scene you follow.',
          push: true,
          email: false,
        },
        {
          id: 'scene_shared',
          label: 'Scene shared with you',
          description: 'A scene is shared with you directly.',
          push: true,
          email: true,
        },
      ],
    },
  ],
  accounts: [
    {
      title: 'Account notifications',
      settings: [
        {
          id: 'security_alerts',
          label: 'Security alerts',
          description: 'Important security notifications about your account.',
          push: true,
          email: true,
        },
        {
          id: 'login_new_device',
          label: 'Login from new device',
          description: 'Alert when your account is accessed from a new device.',
          push: true,
          email: true,
        },
        {
          id: 'account_changes',
          label: 'Account changes',
          description: 'Notifications about changes to your account settings.',
          push: false,
          email: true,
        },
      ],
    },
  ],
};

export const SUPPORTED_NOTIFICATION_EVENT_IDS = Object.freeze(
  (Object.keys(DEFAULT_NOTIFICATION_SETTINGS) as NotificationTab[]).flatMap((tab) =>
    DEFAULT_NOTIFICATION_SETTINGS[tab].flatMap((category) =>
      category.settings.map((setting) => setting.id)
    )
  )
);

export function cloneDefaultNotificationSettings(): NotificationSettingsMap {
  return (Object.keys(DEFAULT_NOTIFICATION_SETTINGS) as NotificationTab[]).reduce(
    (acc, tab) => {
      acc[tab] = DEFAULT_NOTIFICATION_SETTINGS[tab].map((category) => ({
        title: category.title,
        settings: category.settings.map((setting) => ({ ...setting })),
      }));
      return acc;
    },
    {} as NotificationSettingsMap
  );
}

export function normalizeNotificationSettings(savedSettings: unknown): NotificationSettingsMap {
  const normalized = cloneDefaultNotificationSettings();

  if (!savedSettings || typeof savedSettings !== 'object') {
    return normalized;
  }

  const saved = savedSettings as Record<string, unknown>;

  (Object.keys(normalized) as NotificationTab[]).forEach((tab) => {
    const savedTab = saved[tab];
    if (!Array.isArray(savedTab)) return;

    normalized[tab].forEach((category) => {
      category.settings.forEach((setting) => {
        for (const savedCategory of savedTab) {
          if (!savedCategory || typeof savedCategory !== 'object') continue;
          const categoryRecord = savedCategory as { settings?: unknown };
          if (!Array.isArray(categoryRecord.settings)) continue;

          const matched = categoryRecord.settings.find((savedSetting) => {
            if (!savedSetting || typeof savedSetting !== 'object') return false;
            const savedSettingRecord = savedSetting as { id?: unknown };
            return savedSettingRecord.id === setting.id;
          }) as { push?: unknown; email?: unknown } | undefined;

          if (matched) {
            if (typeof matched.push === 'boolean') setting.push = matched.push;
            if (typeof matched.email === 'boolean') setting.email = matched.email;
            break;
          }
        }
      });
    });
  });

  return normalized;
}

export function getNotificationSetting(
  settings: NotificationSettingsMap,
  eventId: string
): NotificationSetting | null {
  for (const tab of Object.keys(settings) as NotificationTab[]) {
    for (const category of settings[tab]) {
      const found = category.settings.find((setting) => setting.id === eventId);
      if (found) return found;
    }
  }
  return null;
}

export function isNotificationEnabled(
  settings: NotificationSettingsMap,
  eventId: string,
  channel: NotificationChannel
): boolean {
  const setting = getNotificationSetting(settings, eventId);
  if (!setting) return false;
  return channel === 'push' ? setting.push : setting.email;
}
