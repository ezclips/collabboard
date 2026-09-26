'use client';

import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { getBoardLimitForEntitlements, getPermissionContext } from '@/lib/auth/permissions';
import { PLANS, PLAN_ORDER, PLAN_RENEWAL_DATE_FORMAT } from '@/lib/domain/billing/plans';
import type { PlanId } from '@/lib/domain/billing/plans';
import { effectivePlanId, formatPlanPrice } from '@/lib/domain/billing/plans';
import { formatBytes } from '@/lib/domain/storage/uploadLimits';
import { useSupabase } from '@/lib/supabase-provider';
import type { WorkspaceRole, SubscriptionStatus } from '@/types/permissions';

const CONFIRM_MESSAGE = 'Your plan changes now. The price difference is settled on your next invoice.';

/** PATCH-191. One workspace's usage, exactly as `GET /api/billing/usage` returns it. */
interface BillingUsage {
    planId: PlanId;
    trialEndsAt: string | null;
    credits: { used: number; total: number; remaining: number; renewsOn: string | null };
    documents: { used: number; limit: number | null };
    boards: { used: number; limit: number | null };
}

/** PATCH-191. The ONE date spelling, shared with the refusal text. */
function formatBillingDate(iso: string): string {
    return PLAN_RENEWAL_DATE_FORMAT.format(new Date(iso));
}

/** A bounded percentage, 0 at no limit. */
function meterPercent(used: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
}

/** PATCH-191. Grey below 80%, amber at 80%, the page's error red at 100%. */
function meterBarClass(percent: number): string {
    if (percent >= 100) return 'bg-red-600';
    if (percent >= 80) return 'bg-amber-500';
    return 'bg-purple-600';
}

/**
 * PATCH-191. A usage bar with an accessible value. It exists only where there
 * IS a limit; an unlimited meter renders a bare count.
 */
function MeterBar({ used, limit, label }: { used: number; limit: number; label: string }) {
    const percent = meterPercent(used, limit);
    return (
        <div
            role="meter"
            aria-label={label}
            aria-valuenow={used}
            aria-valuemin={0}
            aria-valuemax={limit}
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100"
        >
            <div
                data-meter-fill="true"
                className={`h-full rounded-full ${meterBarClass(percent)}`}
                style={{ width: `${percent}%` }}
            />
        </div>
    );
}

/** PATCH-191. "renews on 25 October", or the trial's own end, or nothing. */
function creditsRenewalText(usage: BillingUsage): string {
    if (usage.trialEndsAt) return `trial ends on ${formatBillingDate(usage.trialEndsAt)}`;
    if (usage.credits.renewsOn) return `renews on ${formatBillingDate(usage.credits.renewsOn)}`;
    return '';
}

function planFeatures(planId: PlanId): string[] {
    const { limits } = PLANS[planId];
    // PATCH-189. Free's card says what Free KEEPS (boards, sharing) and what it
    // no longer has. It must not read "0 Knowledge documents" or "0 AI credits
    // / month".
    if (planId === 'free') {
        return [
            `${limits.boards} boards`,
            `${formatBytes(limits.fileSizeBytes)} per file`,
            'No AI',
            'No new documents',
        ];
    }
    return [
        limits.boards === null ? 'Unlimited boards' : `${limits.boards} boards`,
        `${formatBytes(limits.fileSizeBytes)} per file`,
        `${limits.pagesPerPdf} pages per PDF`,
        limits.processedDocuments === null
            ? 'Unlimited Knowledge documents'
            : `${limits.processedDocuments} Knowledge documents`,
        `${limits.monthlyAiCredits} AI credits / month`,
        ...(limits.modelTier === 'premium' ? ['Premium AI models'] : [])
    ];
}

/** PATCH-189. Whole days left in the trial, rounded up; never less than 1. */
function trialDaysLeft(endsAt: string, now: Date): number {
    const remaining = new Date(endsAt).getTime() - now.getTime();
    return Math.max(1, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

const plans = PLAN_ORDER.map((id) => ({
    id,
    name: PLANS[id].name,
    tagline: PLANS[id].tagline,
    features: planFeatures(id),
    priceMonthly: `${formatPlanPrice(PLANS[id].price.monthly)} /month`,
    priceYearly: PLANS[id].price.yearly > 0 ? `${formatPlanPrice(PLANS[id].price.yearly)} /year` : ''
}));

export default function BillingPage() {
    const { supabase } = useSupabase();
    const [loading, setLoading] = useState(true);
    const [currentPlan, setCurrentPlan] = useState<PlanId>('free');
    const [currentStatus, setCurrentStatus] = useState<SubscriptionStatus>('free');
    const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
    const [boardsUsed, setBoardsUsed] = useState(0);
    const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole | null>(null);
    const [openingPortal, setOpeningPortal] = useState(false);
    const [startingCheckout, setStartingCheckout] = useState(false);
    const [changing, setChanging] = useState(false);
    const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
    const [cardError, setCardError] = useState<{ plan: PlanId; message: string } | null>(null);
    // PATCH-191. The usage meters, independent of the plan cards: a failed usage
    // read says so and leaves the rest of the page working.
    const [usage, setUsage] = useState<BillingUsage | null>(null);
    const [usageLoading, setUsageLoading] = useState(true);
    const [usageFailed, setUsageFailed] = useState(false);

    const onPaidPlan = effectivePlanId(currentPlan, currentStatus) !== 'free';
    const canManageBilling = workspaceRole === 'owner' || workspaceRole === 'admin';
    // PATCH-189. During the trial no card is "current" -- the trial is Premium
    // level, and Pro and Premium must still be offered. After it, Free is shown.
    const onTrial = trialEndsAt !== null;
    const trialDays = onTrial ? trialDaysLeft(trialEndsAt, new Date()) : 0;

    useEffect(() => {
        void loadBillingData();
        void loadUsage();
    }, []);

    const loadBillingData = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const permissionContext = await getPermissionContext(supabase, user);
            const workspaceId = permissionContext.workspaceMembership?.workspaceId;
            if (!workspaceId) return;

            setCurrentPlan(permissionContext.entitlements.plan);
            setCurrentStatus(permissionContext.entitlements.status);
            setTrialEndsAt(permissionContext.entitlements.trialEndsAt);
            setWorkspaceRole(permissionContext.workspaceMembership?.role ?? null);

            const { count } = await supabase
                .from('boards')
                .select('*', { count: 'exact', head: true })
                .eq('workspace_id', workspaceId)
                .is('deleted_at', null);

            setBoardsUsed(count ?? 0);
        } catch (err) {
            console.error('Error loading billing data:', err);
        } finally {
            setLoading(false);
        }
    };

    // PATCH-191. Fetch the usage meters the same way the page fetches anything
    // else: the session token in an Authorization header. A failure or a
    // non-OK response shows the message; it never blocks the plan cards.
    const loadUsage = async () => {
        try {
            setUsageLoading(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                setUsageFailed(true);
                setUsage(null);
                return;
            }
            const response = await fetch('/api/billing/usage', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                setUsageFailed(true);
                setUsage(null);
                return;
            }
            setUsage(data as BillingUsage);
            setUsageFailed(false);
        } catch (err) {
            console.error('Error loading usage:', err);
            setUsageFailed(true);
            setUsage(null);
        } finally {
            setUsageLoading(false);
        }
    };

    const openBillingPortal = async () => {
        try {
            setOpeningPortal(true);
            // getSession() already refreshes an expired token internally; an
            // extra refreshSession() on null just burns Supabase auth quota.
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                throw new Error('No active session. Please sign in again.');
            }
            const response = await fetch('/api/stripe/portal', {
                method: 'POST',
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.url) {
                throw new Error(data.error || 'Failed to open billing portal');
            }
            window.location.href = data.url;
        } catch (err) {
            console.error('Error opening billing portal:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to open billing portal');
        } finally {
            setOpeningPortal(false);
        }
    };

    const startCheckout = async (planId: PlanId) => {
        setCardError(null);
        try {
            setStartingCheckout(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                throw new Error('No active session. Please sign in again.');
            }
            const response = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ plan: planId, interval: 'monthly' }),
            });
            const data = await response.json().catch(() => ({}));
            // A stale page can still offer Upgrade while a subscription exists.
            if (response.status === 409 && data.code === 'already_subscribed') {
                setCardError({
                    plan: planId,
                    message: data.error || 'This workspace already has a subscription.'
                });
                await loadBillingData();
                await loadUsage();
                return;
            }
            if (!response.ok || !data.url) {
                throw new Error(data.error || 'Failed to start checkout');
            }
            window.location.href = data.url;
        } catch (err) {
            console.error('Error starting checkout:', err);
            setCardError({
                plan: planId,
                message: err instanceof Error ? err.message : 'Failed to start checkout'
            });
            toast.error('Failed to start checkout');
        } finally {
            setStartingCheckout(false);
        }
    };

    const confirmChangePlan = async (planId: PlanId) => {
        setCardError(null);
        try {
            setChanging(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                throw new Error('No active session. Please sign in again.');
            }
            const response = await fetch('/api/stripe/change-plan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ plan: planId, interval: 'monthly' }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || 'Failed to change the plan');
            }
            setPendingPlan(null);
            await loadBillingData();
            await loadUsage();
        } catch (err) {
            console.error('Error changing plan:', err);
            setCardError({
                plan: planId,
                message: err instanceof Error ? err.message : 'Failed to change the plan'
            });
        } finally {
            setChanging(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Workspace plan and subscription status
                    {workspaceRole ? ` · Role: ${workspaceRole}` : ''}
                </p>
            </div>

            {onTrial && (
                <div
                    data-billing-trial="true"
                    className="mb-4 rounded-xl border border-purple-200 bg-purple-50 px-6 py-4 text-sm text-purple-900"
                >
                    Premium trial — {trialDays} {trialDays === 1 ? 'day' : 'days'} left
                </div>
            )}

            {!onTrial && currentPlan === 'free' && (
                <div
                    data-billing-trial-ended="true"
                    className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-6 py-4 text-sm text-gray-700"
                >
                    Your Premium trial has ended. You&apos;re on Free: boards and sharing stay;
                    AI and new documents need a plan.
                </div>
            )}

            {/* PATCH-191. Usage, above the plan cards, for every member. */}
            <section
                data-billing-usage="true"
                className="mb-6 bg-white rounded-xl border border-gray-200 p-6"
            >
                <h2 className="text-lg font-semibold text-gray-900">Usage</h2>

                {usageLoading && (
                    <p className="mt-2 text-sm text-gray-500">Loading usage…</p>
                )}

                {!usageLoading && usageFailed && (
                    <p className="mt-2 text-sm text-gray-500">Usage is unavailable right now.</p>
                )}

                {!usageLoading && !usageFailed && usage && (
                    <div className="mt-4 space-y-5">
                        <div>
                            <div className="flex items-center justify-between gap-4 text-sm">
                                <span className="font-medium text-gray-900">AI credits</span>
                                <span className="text-gray-600">
                                    {usage.planId === 'free' ? (
                                        <>
                                            No AI on Free{' '}
                                            <a
                                                href="/dashboard/settings/billing"
                                                className="font-medium underline"
                                            >
                                                See plans
                                            </a>
                                        </>
                                    ) : (
                                        `${usage.credits.used} of ${usage.credits.total} used · ${creditsRenewalText(usage)}`
                                    )}
                                </span>
                            </div>
                            {usage.planId !== 'free' && (
                                <MeterBar
                                    used={usage.credits.used}
                                    limit={usage.credits.total}
                                    label={`AI credits: ${usage.credits.used} of ${usage.credits.total} used`}
                                />
                            )}
                        </div>

                        <div>
                            <div className="flex items-center justify-between gap-4 text-sm">
                                <span className="font-medium text-gray-900">Knowledge documents</span>
                                <span className="text-gray-600">
                                    {usage.documents.limit === null
                                        ? `${usage.documents.used} processed`
                                        : usage.documents.limit === 0
                                            ? `${usage.documents.used} processed · no new documents on Free`
                                            : `${usage.documents.used} of ${usage.documents.limit} documents`}
                                </span>
                            </div>
                            {usage.documents.limit !== null && usage.documents.limit > 0 && (
                                <MeterBar
                                    used={usage.documents.used}
                                    limit={usage.documents.limit}
                                    label={`Knowledge documents: ${usage.documents.used} of ${usage.documents.limit} used`}
                                />
                            )}
                        </div>

                        <div>
                            <div className="flex items-center justify-between gap-4 text-sm">
                                <span className="font-medium text-gray-900">Boards</span>
                                <span className="text-gray-600">
                                    {usage.boards.limit === null
                                        ? `${usage.boards.used} boards`
                                        : `${usage.boards.used} of ${usage.boards.limit} boards`}
                                </span>
                            </div>
                            {usage.boards.limit !== null && (
                                <MeterBar
                                    used={usage.boards.used}
                                    limit={usage.boards.limit}
                                    label={`Boards: ${usage.boards.used} of ${usage.boards.limit} used`}
                                />
                            )}
                        </div>
                    </div>
                )}
            </section>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {plans.map((plan) => {
                    const isCurrent = !onTrial && currentPlan === plan.id;
                    return (
                        <div key={plan.id} className="px-6 py-5 flex items-center justify-between gap-6">
                            <div className="flex items-center gap-8">
                                <div className="w-24">
                                    <span className="font-semibold text-gray-900">{plan.name}</span>
                                    {isCurrent && <Check className="w-4 h-4 text-purple-600 inline ml-1" />}
                                </div>
                                <div className="text-gray-600 text-sm">
                                    <div className="text-gray-900 font-medium">{plan.tagline}</div>
                                    <div>{plan.features.join(' · ')}</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-8">
                                <div className="text-right">
                                    <div className="text-gray-900">{plan.priceMonthly}</div>
                                    {plan.priceYearly && (
                                        <div className="text-sm text-gray-500">{plan.priceYearly}</div>
                                    )}
                                </div>

                                <div className="w-56 text-right">
                                    {isCurrent ? (
                                        <div className="text-sm text-purple-600">
                                            {plan.id === 'free'
                                                ? `${boardsUsed} / ${getBoardLimitForEntitlements({ plan: currentPlan, status: currentStatus, trialEndsAt })} boards`
                                                : `Status: ${currentStatus}`}
                                        </div>
                                    ) : plan.id === 'free' || !canManageBilling ? null : pendingPlan === plan.id ? (
                                        <div>
                                            <p className="text-xs text-gray-600 mb-2">{CONFIRM_MESSAGE}</p>
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => confirmChangePlan(plan.id)}
                                                    disabled={changing}
                                                    className="px-4 py-2 bg-purple-600 text-white rounded-full font-medium text-xs hover:bg-purple-700 transition-colors disabled:opacity-60"
                                                >
                                                    {changing ? 'Changing...' : 'Confirm'}
                                                </button>
                                                <button
                                                    onClick={() => setPendingPlan(null)}
                                                    disabled={changing}
                                                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-full font-medium text-xs hover:bg-gray-200 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : onPaidPlan ? (
                                        <button
                                            onClick={() => {
                                                setCardError(null);
                                                setPendingPlan(plan.id);
                                            }}
                                            className="px-5 py-2 bg-purple-600 text-white rounded-full font-medium text-sm hover:bg-purple-700 transition-colors"
                                        >
                                            {`Switch to ${plan.name}`}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => startCheckout(plan.id)}
                                            disabled={startingCheckout}
                                            className="px-5 py-2 bg-pink-500 text-white rounded-full font-medium text-sm hover:bg-pink-600 transition-colors"
                                        >
                                            {startingCheckout ? 'Starting...' : 'Upgrade'}
                                        </button>
                                    )}

                                    {cardError?.plan === plan.id && (
                                        <p className="text-xs text-red-600 mt-2">{cardError.message}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {!onTrial && currentPlan !== 'free' && canManageBilling && (
                <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
                    <p className="text-gray-600">Manage payment methods, invoices, and subscription changes in Stripe.</p>
                    <button
                        onClick={openBillingPortal}
                        disabled={openingPortal}
                        className="mt-4 text-purple-600 font-medium hover:text-purple-700 transition-colors"
                    >
                        {openingPortal ? 'Opening portal...' : 'Open billing portal →'}
                    </button>
                </div>
            )}

            <div className="mt-8 text-center">
                <a href="#" className="text-purple-600 hover:text-purple-700 font-medium inline-flex items-center gap-2">
                    Have questions about billing?
                    <ExternalLink className="w-4 h-4" />
                </a>
            </div>
        </div>
    );
}
