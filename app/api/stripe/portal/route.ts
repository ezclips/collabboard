import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import { getStripeAdmin } from "@/lib/stripe/admin";
import { resolveCurrentWorkspace } from "@/lib/workspace/context";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const stripeAdmin = getStripeAdmin();
    const supabaseAdmin = getSupabaseAdmin();
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && accessToken) {
      const {
        data: { user: tokenUser },
        error,
      } = await supabaseAdmin.auth.getUser(accessToken);

      if (error) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      user = tokenUser;
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await resolveCurrentWorkspace(supabase, user, supabaseAdmin);
    if (!workspace) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    const { data: customerRow } = await supabaseAdmin
      .from("customers")
      .select("stripe_customer_id")
      .eq("workspace_id", workspace.workspaceId)
      .single();

    if (!customerRow?.stripe_customer_id) {
      return NextResponse.json({ error: "No Stripe customer found" }, { status: 404 });
    }

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripeAdmin.billingPortal.sessions.create({
      customer: customerRow.stripe_customer_id,
      return_url: `${origin}/dashboard/settings/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe portal error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create portal session",
      },
      { status: 500 },
    );
  }
}
