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
const EMAIL_NOT_CONFIRMED_MESSAGE = 'Your email address is not confirmed yet.';
const APP_RATE_LIMIT_MESSAGE = 'Too many sign-in attempts in this app. Try again in a few minutes.';
const AUTH_PROVIDER_RATE_LIMIT_MESSAGE = 'Sign-in is temporarily rate-limited by Supabase. Try again in a few minutes.';
const LOGIN_PHASES = new Set(['preflight', 'success', 'failure']);

function isRateLimitError(errorMessage: string | undefined) {
  return (errorMessage || '').toLowerCase().includes('rate limit');
}

function getAuthFailureMessage(errorMessage: string | undefined) {
  const normalized = (errorMessage || '').toLowerCase();

  if (normalized.includes('email not confirmed')) {
    return EMAIL_NOT_CONFIRMED_MESSAGE;
  }

  if (normalized.includes('rate limit')) {
    return AUTH_PROVIDER_RATE_LIMIT_MESSAGE;
  }

  if (normalized.includes('invalid login credentials')) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  return errorMessage || INVALID_CREDENTIALS_MESSAGE;
}

function getSupabaseAnonServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }

  if (!supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  let retryAfterSeconds: number | null = null;

  return {
    getRetryAfterSeconds: () => retryAfterSeconds,
    client: createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (response.status === 429) {
            const retryAfterHeader = response.headers.get('Retry-After');
            if (retryAfterHeader) {
              const parsed = Number(retryAfterHeader);
              if (Number.isFinite(parsed) && parsed > 0) {
                retryAfterSeconds = Math.ceil(parsed);
              }
            }
          }
          return response;
        },
      },
    }),
  };
}

async function fetchRecentFailures(emailHash: string, ipHash: string | null) {
  const supabaseAdmin = getSupabaseAdmin();
  const windowStart = new Date(Date.now() - LOGIN_RATE_LIMIT_WINDOW_MS).toISOString();

  const [{ data: emailFailures, error: emailError }, ipResult] = await Promise.all([
    supabaseAdmin
      .from('auth_rate_limit_events')
      .select('created_at')
      .eq('action', 'login')
      .eq('success', false)
      .eq('email_hash', emailHash)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(32),
    ipHash
      ? supabaseAdmin
          .from('auth_rate_limit_events')
          .select('created_at')
          .eq('action', 'login')
          .eq('success', false)
          .eq('ip_hash', ipHash)
          .gte('created_at', windowStart)
          .order('created_at', { ascending: false })
          .limit(32)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (emailError) {
    throw new Error(emailError.message);
  }

  if (ipResult.error) {
    throw new Error(ipResult.error.message);
  }

  return {
    emailFailures: (emailFailures ?? []) as RateLimitEvent[],
    ipFailures: ((ipResult.data ?? []) as RateLimitEvent[]),
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
    const phase = typeof body?.phase === 'string' && LOGIN_PHASES.has(body.phase) ? body.phase : null;
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || (!phase && !password)) {
      return NextResponse.json({ error: INVALID_CREDENTIALS_MESSAGE }, { status: 400 });
    }

    const ip = getRequestIp(req.headers);
    const emailHash = hashRateLimitValue(email);
    const ipHash = ip === 'unknown' ? null : hashRateLimitValue(ip);
    const storedIpHash = ipHash ?? hashRateLimitValue(`unknown:${emailHash}`);
    const userAgent = req.headers.get('user-agent') ?? '';

    const { emailFailures, ipFailures } = await fetchRecentFailures(emailHash, ipHash);
    const throttleState = getThrottleState(emailFailures, ipFailures);
    if (throttleState) {
      return NextResponse.json(
        {
          error: APP_RATE_LIMIT_MESSAGE,
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

    if (phase === 'preflight') {
      return NextResponse.json({ success: true });
    }

    if (phase === 'failure') {
      const authErrorMessage = typeof body?.error === 'string' ? body.error : undefined;
      if (!isRateLimitError(authErrorMessage)) {
        await recordRateLimitEvent({
          action: 'login',
          emailHash,
          ipHash: storedIpHash,
          success: false,
          userAgent,
        });
      }

      return NextResponse.json({ success: true });
    }

    if (phase === 'success') {
      const cookieStore = cookies();
      const routeSupabase = createRouteHandlerClient({ cookies: () => cookieStore });
      const {
        data: { user },
        error: userError,
      } = await routeSupabase.auth.getUser();

      if (userError || !user || normalizeEmail(user.email || '') !== email) {
        return NextResponse.json({ error: 'Unable to verify signed-in user.' }, { status: 401 });
      }

      await Promise.all([
        recordRateLimitEvent({
          action: 'login',
          emailHash,
          ipHash: storedIpHash,
          success: true,
          userAgent,
        }),
        clearLoginFailures(emailHash),
      ]);

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email ?? email,
          fullName: (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name) || null,
        },
      });
    }

    const { client: authClient, getRetryAfterSeconds } = getSupabaseAnonServerClient();
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      const authErrorMessage = error?.message;
      const providerRateLimited = isRateLimitError(authErrorMessage);

      if (!providerRateLimited) {
        await recordRateLimitEvent({
          action: 'login',
          emailHash,
          ipHash: storedIpHash,
          success: false,
          userAgent,
        });
      }

      return NextResponse.json(
        {
          error: getAuthFailureMessage(authErrorMessage),
          retryAfterSeconds: providerRateLimited ? getRetryAfterSeconds() ?? 60 : undefined,
        },
        providerRateLimited
          ? {
              status: 429,
              headers: {
                'Retry-After': String(getRetryAfterSeconds() ?? 60),
              },
            }
          : { status: 401 }
      );
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

    const signedInUser = {
      id: data.user?.id ?? data.session.user.id,
      email: data.user?.email ?? data.session.user.email ?? email,
      fullName:
        (typeof data.user?.user_metadata?.full_name === 'string' && data.user.user_metadata.full_name) ||
        (typeof data.session.user.user_metadata?.full_name === 'string' && data.session.user.user_metadata.full_name) ||
        null,
    };

    const { error: profileError } = await routeSupabase.from('profiles').upsert({
      id: signedInUser.id,
      email: signedInUser.email,
      display_name: signedInUser.fullName,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      console.warn('Profile upsert after login failed:', profileError);
    }

    await Promise.all([
      recordRateLimitEvent({
        action: 'login',
        emailHash,
        ipHash: storedIpHash,
        success: true,
        userAgent,
      }),
      clearLoginFailures(emailHash),
    ]);

    return NextResponse.json({
      success: true,
      user: signedInUser,
    });
  } catch (error) {
    console.error('Login route error:', error);
    return NextResponse.json({ error: 'Unable to sign in right now. Please try again.' }, { status: 500 });
  }
}
