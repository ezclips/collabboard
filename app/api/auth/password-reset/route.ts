import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  getPasswordResetBackoffMs,
  getRequestIp,
  hashRateLimitValue,
  normalizeEmail,
  PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
} from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';

const GENERIC_MESSAGE =
  'If an account exists for that email, password reset instructions will be sent.';

type RateLimitEvent = {
  created_at: string;
};

function getSupabaseAnonServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }

  if (!supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function fetchRecentFailures(emailHash: string, ipHash: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const windowStart = new Date(Date.now() - PASSWORD_RESET_RATE_LIMIT_WINDOW_MS).toISOString();

  const [{ data: emailFailures, error: emailError }, { data: ipFailures, error: ipError }] = await Promise.all([
    supabaseAdmin
      .from('auth_rate_limit_events')
      .select('created_at')
      .eq('action', 'password_reset')
      .eq('success', false)
      .eq('email_hash', emailHash)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(16),
    supabaseAdmin
      .from('auth_rate_limit_events')
      .select('created_at')
      .eq('action', 'password_reset')
      .eq('success', false)
      .eq('ip_hash', ipHash)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(16),
  ]);

  if (emailError) {
    throw new Error(emailError.message);
  }

  if (ipError) {
    throw new Error(ipError.message);
  }

  return {
    emailFailures: (emailFailures ?? []) as RateLimitEvent[],
    ipFailures: (ipFailures ?? []) as RateLimitEvent[],
  };
}

function isResetThrottled(emailFailures: RateLimitEvent[], ipFailures: RateLimitEvent[]) {
  const dominantFailures = emailFailures.length >= ipFailures.length ? emailFailures : ipFailures;
  const latestFailure = dominantFailures[0];
  const backoffMs = getPasswordResetBackoffMs(dominantFailures.length);

  if (!latestFailure || backoffMs === 0) {
    return false;
  }

  return Date.now() < new Date(latestFailure.created_at).getTime() + backoffMs;
}

async function recordRateLimitEvent(params: {
  action: 'password_reset';
  emailHash: string;
  ipHash: string;
  success: boolean;
  userAgent: string;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from('auth_rate_limit_events').insert({
    action: params.action,
    email_hash: params.emailHash,
    ip_hash: params.ipHash,
    success: params.success,
    user_agent: params.userAgent || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const redirectTo = new URL('/auth/reset-password', req.nextUrl.origin).toString();

    const ip = getRequestIp(req.headers);
    const emailHash = hashRateLimitValue(email);
    const ipHash = hashRateLimitValue(ip);
    const userAgent = req.headers.get('user-agent') ?? '';

    const { emailFailures, ipFailures } = await fetchRecentFailures(emailHash, ipHash);
    if (isResetThrottled(emailFailures, ipFailures)) {
      return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
    }

    const authClient = getSupabaseAnonServerClient();
    const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo });

    await recordRateLimitEvent({
      action: 'password_reset',
      emailHash,
      ipHash,
      success: !error,
      userAgent,
    });

    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  } catch (error) {
    console.error('Password reset route error:', error);
    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  }
}
