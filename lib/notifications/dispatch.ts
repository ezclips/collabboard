import type { NotificationChannel } from '@/lib/notifications/preferences';
import { isPushConfigured, sendPushToUser } from '@/lib/notifications/push';

type DispatchStatus = 'sent' | 'skipped' | 'failed';

export interface ChannelDispatchResult {
  channel: NotificationChannel;
  status: DispatchStatus;
  reason?: string;
}

export interface DispatchInput {
  eventId: string;
  channels: NotificationChannel[];
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  context?: Record<string, unknown>;
}

function buildEmailTemplate(input: DispatchInput): { subject: string; html: string } | null {
  const appUrl =
    typeof input.context?.appUrl === 'string' && input.context.appUrl.length > 0
      ? input.context.appUrl
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (input.eventId === 'invitation_collaborate') {
    const workspaceRole =
      typeof input.context?.role === 'string' && input.context.role.length > 0
        ? input.context.role
        : 'member';
    const workspaceLink =
      typeof input.context?.workspaceLink === 'string' && input.context.workspaceLink.length > 0
        ? input.context.workspaceLink
        : `${appUrl}/dashboard`;

    return {
      subject: 'You were invited to collaborate',
      html: [
        `<p>Hello${input.recipientName ? ` ${input.recipientName}` : ''},</p>`,
        `<p>You were invited to collaborate as <strong>${workspaceRole}</strong>.</p>`,
        `<p><a href="${workspaceLink}">Open CollabBoard</a></p>`,
      ].join(''),
    };
  }

  if (input.eventId === 'comments_posts') {
    const workspaceLink =
      typeof input.context?.workspaceLink === 'string' && input.context.workspaceLink.length > 0
        ? input.context.workspaceLink
        : `${appUrl}/dashboard`;

    return {
      subject: 'New comment activity on your canvas',
      html: [
        `<p>Hello${input.recipientName ? ` ${input.recipientName}` : ''},</p>`,
        '<p>There is new comment activity on content you own.</p>',
        `<p><a href="${workspaceLink}">View comments</a></p>`,
      ].join(''),
    };
  }

  if (input.eventId === 'scene_shared') {
    const workspaceLink =
      typeof input.context?.workspaceLink === 'string' && input.context.workspaceLink.length > 0
        ? input.context.workspaceLink
        : `${appUrl}/dashboard`;
    const role =
      typeof input.context?.role === 'string' && input.context.role.length > 0
        ? input.context.role
        : 'viewer';
    const canvasTitle =
      typeof input.context?.canvasTitle === 'string' && input.context.canvasTitle.length > 0
        ? input.context.canvasTitle
        : 'a canvas';

    return {
      subject: 'A scene was shared with you',
      html: [
        `<p>Hello${input.recipientName ? ` ${input.recipientName}` : ''},</p>`,
        `<p>You were added to <strong>${canvasTitle}</strong> with <strong>${role}</strong> access.</p>`,
        `<p><a href="${workspaceLink}">Open scene</a></p>`,
      ].join(''),
    };
  }

  if (input.eventId === 'account_changes') {
    const workspaceLink =
      typeof input.context?.workspaceLink === 'string' && input.context.workspaceLink.length > 0
        ? input.context.workspaceLink
        : `${appUrl}/dashboard/settings/profile`;

    return {
      subject: 'Your account settings were updated',
      html: [
        `<p>Hello${input.recipientName ? ` ${input.recipientName}` : ''},</p>`,
        '<p>Your account settings were changed.</p>',
        `<p><a href="${workspaceLink}">Review account settings</a></p>`,
      ].join(''),
    };
  }

  if (input.eventId === 'security_alerts') {
    const workspaceLink =
      typeof input.context?.workspaceLink === 'string' && input.context.workspaceLink.length > 0
        ? input.context.workspaceLink
        : `${appUrl}/dashboard/settings/password`;
    const action =
      typeof input.context?.action === 'string' && input.context.action.length > 0
        ? input.context.action
        : 'Security-related account change';

    return {
      subject: 'Security alert for your account',
      html: [
        `<p>Hello${input.recipientName ? ` ${input.recipientName}` : ''},</p>`,
        `<p>${action}</p>`,
        `<p><a href="${workspaceLink}">Review security settings</a></p>`,
      ].join(''),
    };
  }

  return null;
}

async function sendEmail(input: DispatchInput): Promise<ChannelDispatchResult> {
  if (!input.recipientEmail) {
    return { channel: 'email', status: 'skipped', reason: 'missing_recipient_email' };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.NOTIFICATIONS_FROM_EMAIL;
  if (!resendApiKey || !fromEmail) {
    return { channel: 'email', status: 'skipped', reason: 'email_provider_not_configured' };
  }

  const template = buildEmailTemplate(input);
  if (!template) {
    return { channel: 'email', status: 'skipped', reason: 'unsupported_email_template' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [input.recipientEmail],
        subject: template.subject,
        html: template.html,
      }),
    });

    if (!response.ok) {
      return { channel: 'email', status: 'failed', reason: `provider_error_${response.status}` };
    }

    return { channel: 'email', status: 'sent' };
  } catch {
    return { channel: 'email', status: 'failed', reason: 'provider_exception' };
  }
}

function buildPushPayload(input: DispatchInput): { title: string; body: string; url: string } | null {
  const appUrl =
    typeof input.context?.appUrl === 'string' && input.context.appUrl.length > 0
      ? input.context.appUrl
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const workspaceLink =
    typeof input.context?.workspaceLink === 'string' && input.context.workspaceLink.length > 0
      ? input.context.workspaceLink
      : `${appUrl}/dashboard`;

  if (input.eventId === 'invitation_collaborate') {
    return {
      title: 'Invitation to collaborate',
      body: 'You received a new collaboration invitation.',
      url: workspaceLink,
    };
  }

  if (input.eventId === 'comments_posts') {
    return {
      title: 'New comment activity',
      body: 'Someone commented on your content.',
      url: workspaceLink,
    };
  }

  if (input.eventId === 'scene_shared') {
    return {
      title: 'Scene shared with you',
      body: 'A scene was shared with your account.',
      url: workspaceLink,
    };
  }

  if (input.eventId === 'account_changes') {
    return {
      title: 'Account settings changed',
      body: 'Your account settings were updated.',
      url: workspaceLink,
    };
  }

  if (input.eventId === 'security_alerts') {
    return {
      title: 'Security alert',
      body: 'There was a security-related account action.',
      url: workspaceLink,
    };
  }

  return null;
}

async function sendPush(input: DispatchInput): Promise<ChannelDispatchResult> {
  if (!input.recipientUserId) {
    return { channel: 'push', status: 'skipped', reason: 'missing_recipient_user_id' };
  }
  if (!isPushConfigured()) {
    return { channel: 'push', status: 'skipped', reason: 'push_provider_not_configured' };
  }

  const payload = buildPushPayload(input);
  if (!payload) {
    return { channel: 'push', status: 'skipped', reason: 'unsupported_push_template' };
  }

  const result = await sendPushToUser(input.recipientUserId, payload);
  if (result.sent > 0) return { channel: 'push', status: 'sent' };
  if (result.failed > 0) return { channel: 'push', status: 'failed', reason: 'push_send_failed' };
  return { channel: 'push', status: 'skipped', reason: 'no_active_subscriptions' };
}

export async function dispatchNotification(input: DispatchInput): Promise<ChannelDispatchResult[]> {
  const uniqueChannels = [...new Set(input.channels)];
  const results: ChannelDispatchResult[] = [];

  for (const channel of uniqueChannels) {
    if (channel === 'email') {
      results.push(await sendEmail(input));
      continue;
    }
    if (channel === 'push') {
      results.push(await sendPush(input));
      continue;
    }
  }

  return results;
}
