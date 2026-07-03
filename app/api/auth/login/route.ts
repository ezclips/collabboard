import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  getLoginBackoffMs,
  getRequestIp,
  hashRateLimitValue,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  normalizeEmail,
} from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';

type RateLimitEvent = {
  created_at: string;
};

const INVALID_CREDENTIALS_MESSAGE = 'We could not sign you in with that email and password.';

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
  const windowStart = new Date(Date.now() - LOGIN_RATE_LIMIT_WINDOW_MS).toISOString();

  const [{ data: emailFailures, error: emailError }, { data: ipFailures, error: ipError }] = await Promise.all([
    supabaseAdmin
      .from('auth_rate_limit_events')
      .select('created_at')
      .eq('action', 'login')
      .eq('success', false)
      .eq('email_hash', emailHash)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(32),
    supabaseAdmin
      .from('auth_rate_limit_events')
      .select('created_at')
      .eq('action', 'login')
      .eq('success', false)
      .eq('ip_hash', ipHash)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(32),
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

function getThrottleState(emailFailures: RateLimitEvent[], ipFailures: RateLimitEvent[]) {
  const dominantFailures = emailFailures.length >= ipFailures.length ? emailFailures : ipFailures;
  const latestFailure = dominantFailures[0];
  const backoffMs = getLoginBackoffMs(dominantFailures.length);

  if (!latestFailure || backoffMs === 0) {
    return null;
  }

  const throttledUntil = new Date(new Date(latestFailure.created_at).getTime() + backoffMs);
  if (Date.now() >= throttledUntil.getTime()) {
    return null;
  }

  return {
    retryAfterSeconds: Math.max(1, Math.ceil((throttledUntil.getTime() - Date.now()) / 1000)),
  };
}

async function recordRateLimitEvent(params: {
  action: 'login';
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

async function clearLoginFailures(emailHash: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from('auth_rate_limit_events')
    .delete()
    .eq('action', 'login')
    .eq('success', false)
    .eq('email_hash', emailHash);

  if (error) {
    throw new Error(error.message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 400 });
    }

    const ip = getRequestIp(req.headers);
    const emailHash = hashRateLimitValue(email);
    const ipHash = hashRateLimitValue(ip);
    const userAgent = req.headers.get('user-agent') ?? '';

    const { emailFailures, ipFailures } = await fetchRecentFailures(emailHash, ipHash);
    const throttleState = getThrottleState(emailFailures, ipFailures);
    if (throttleState) {
      return NextResponse.json(
        {
          error: 'Too many sign-in attempts. Try again in a few minutes.',
          retryAfterSeconds: throttleState.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(throttleState.retryAfterSeconds),
          },
        }
      );
    }

    const authClient = getSupabaseAnonServerClient();
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      await recordRateLimitEvent({
        action: 'login',
        emailHash,
        ipHash,
        success: false,
        userAgent,
      });

      return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 401 });
    }

    const cookieStore = cookies();
    const routeSupabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const { error: sessionError } = await routeSupabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    if (sessionError) {
      throw new Error(sessionError.message);
    }

    await Promise.all([
      recordRateLimitEvent({
        action: 'login',
        emailHash,
        ipHash,
        success: true,
        userAgent,
      }),
      clearLoginFailures(emailHash),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Login route error:', error);
    return NextResponse.json({ error: 'Unable to sign in right now. Please try again.' }, { status: 500 });
  }
}
