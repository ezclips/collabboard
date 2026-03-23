import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import { getStripeAdmin } from "@/lib/stripe/admin";
import { getStripePriceId } from "@/lib/stripe/client";
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

    const body = await request.json().catch(() => ({}));
    const plan = typeof body.plan === "string" ? body.plan : "pro";
    const interval = body.interval === "yearly" ? "yearly" : "monthly";

    const workspace = await resolveCurrentWorkspace(supabase, user, supabaseAdmin);
    if (!workspace) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    const priceId = getStripePriceId(plan, interval);
    if (!priceId) {
      return NextResponse.json({ error: "Unknown pricing configuration" }, { status: 400 });
    }

    const { data: customerRow } = await supabaseAdmin
      .from("customers")
      .select("id, stripe_customer_id")
      .eq("workspace_id", workspace.workspaceId)
      .maybeSingle();

    let stripeCustomerId = customerRow?.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
      const customer = await stripeAdmin.customers.create({
        email: user.email || undefined,
        name: workspace.workspaceName,
        metadata: {
          workspaceId: workspace.workspaceId,
          userId: user.id,
        },
      });

      stripeCustomerId = customer.id;

      await supabaseAdmin.from("customers").upsert({
        workspace_id: workspace.workspaceId,
        stripe_customer_id: customer.id,
        email: user.email || null,
        name: workspace.workspaceName,
      });
    }

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripeAdmin.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard/settings/billing?checkout=success`,
      cancel_url: `${origin}/dashboard/settings/billing?checkout=cancelled`,
      allow_promotion_codes: true,
      metadata: {
        workspaceId: workspace.workspaceId,
        userId: user.id,
        plan,
        interval,
      },
      subscription_data: {
        metadata: {
          workspaceId: workspace.workspaceId,
          userId: user.id,
          plan,
          interval,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create checkout session",
      },
      { status: 500 },
    );
  }
}
