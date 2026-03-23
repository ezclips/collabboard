import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    if (body?.confirmText !== 'DELETE') {
      return NextResponse.json({ error: 'Confirmation text must be DELETE' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Best-effort cleanup for user-owned settings rows before auth deletion.
    await supabaseAdmin.from('notification_settings').delete().eq('user_id', user.id);
    await supabaseAdmin.from('accessibility_settings').delete().eq('user_id', user.id);
    await supabaseAdmin.from('dashboard_settings').delete().eq('user_id', user.id);
    await supabaseAdmin.from('user_integrations').delete().eq('user_id', user.id);

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteUserError) {
      return NextResponse.json({ error: deleteUserError.message || 'Failed to delete account' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
