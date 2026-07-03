import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  getRequestIp,
  getSignupBackoffMs,
  hashRateLimitValue,
  normalizeEmail,
  SIGNUP_RATE_LIMIT_WINDOW_MS,
} from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';

const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 64;
const GENERIC_SIGNUP_ERROR = 'We could not create your account. Check the form and try again.';

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
  const windowStart = new Date(Date.now() - SIGNUP_RATE_LIMIT_WINDOW_MS).toISOString();

  const [{ data: emailFailures, error: emailError }, { data: ipFailures, error: ipError }] = await Promise.all([
    supabaseAdmin
      .from('auth_rate_limit_events')
      .select('created_at')
      .eq('action', 'signup')
      .eq('success', false)
      .eq('email_hash', emailHash)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(16),
    supabaseAdmin
      .from('auth_rate_limit_events')
      .select('created_at')
      .eq('action', 'signup')
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

function isSignupThrottled(emailFailures: RateLimitEvent[], ipFailures: RateLimitEvent[]) {
  const dominantFailures = emailFailures.length >= ipFailures.length ? emailFailures : ipFailures;
  const latestFailure = dominantFailures[0];
  const backoffMs = getSignupBackoffMs(dominantFailures.length);

  if (!latestFailure || backoffMs === 0) {
    return false;
  }

  return Date.now() < new Date(latestFailure.created_at).getTime() + backoffMs;
}

async function recordRateLimitEvent(params: {
  emailHash: string;
  ipHash: string;
  success: boolean;
  userAgent: string;
}) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.from('auth_rate_limit_events').insert({
    action: 'signup',
    email_hash: params.emailHash,
    ip_hash: params.ipHash,
    success: params.success,
    user_agent: params.userAgent || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function clearSignupFailures(emailHash: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from('auth_rate_limit_events')
    .delete()
    .eq('action', 'signup')
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
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
    const acceptTerms = body?.acceptTerms === true;

    if (!email || !password || !fullName || !acceptTerms) {
      return NextResponse.json({ error: GENERIC_SIGNUP_ERROR }, { status: 400 });
    }

    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json({ error: GENERIC_SIGNUP_ERROR }, { status: 400 });
    }

    const ip = getRequestIp(req.headers);
    const emailHash = hashRateLimitValue(email);
    const ipHash = hashRateLimitValue(ip);
    const userAgent = req.headers.get('user-agent') ?? '';

    const { emailFailures, ipFailures } = await fetchRecentFailures(emailHash, ipHash);
    if (isSignupThrottled(emailFailures, ipFailures)) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Try again in a few minutes.' },
        { status: 429 }
      );
    }

    const authClient = getSupabaseAnonServerClient();
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          display_name: fullName,
        },
      },
    });

    if (error || !data.user) {
      await recordRateLimitEvent({
        emailHash,
        ipHash,
        success: false,
        userAgent,
      });

      return NextResponse.json({ error: GENERIC_SIGNUP_ERROR }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: data.user.id,
      email: data.user.email || email,
      display_name: fullName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      throw new Error(profileError.message);
    }

    if (data.session) {
      const cookieStore = cookies();
      const routeSupabase = createRouteHandlerClient({ cookies: () => cookieStore });
      const { error: sessionError } = await routeSupabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (sessionError) {
        throw new Error(sessionError.message);
      }
    }

    await Promise.all([
      recordRateLimitEvent({
        emailHash,
        ipHash,
        success: true,
        userAgent,
      }),
      clearSignupFailures(emailHash),
    ]);

    return NextResponse.json({
      success: true,
      emailConfirmationRequired: !data.user.email_confirmed_at,
    });
  } catch (error) {
    console.error('Signup route error:', error);
    return NextResponse.json({ error: GENERIC_SIGNUP_ERROR }, { status: 500 });
  }
}
