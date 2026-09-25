'use client';

import React, { useEffect, useState } from 'react';
import { Check, CreditCard, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { getPermissionContext } from '@/lib/auth/permissions';
import { PLANS, PLAN_ORDER } from '@/lib/domain/billing/plans';
import type { PlanId } from '@/lib/domain/billing/plans';
import { formatBytes } from '@/lib/domain/storage/uploadLimits';
import { useSupabase } from '@/lib/supabase-provider';
import type { WorkspaceRole } from '@/types/permissions';

type BillingInterval = 'monthly' | 'yearly';

function planFeatures(planId: PlanId): string[] {
    const { limits } = PLANS[planId];
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

const plans = PLAN_ORDER.map((id) => ({
    id,
    name: PLANS[id].name,
    monthlyLabel: `$${PLANS[id].priceUsd.monthly} /month`,
    yearlyLabel: `$${PLANS[id].priceUsd.yearly} /year`,
    description: PLANS[id].tagline,
    features: planFeatures(id)
}));

export default function SubscriptionPage() {
    const { supabase } = useSupabase();
    const [loading, setLoading] = useState(true);
    const [upgrading, setUpgrading] = useState(false);
    const [openingPortal, setOpeningPortal] = useState(false);
    const [currentPlan, setCurrentPlan] = useState<PlanId>('free');
    const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
    const [subscriptionStatus, setSubscriptionStatus] = useState<string>('free');
    const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole | null>(null);

    useEffect(() => {
        void loadSubscription();
    }, []);

    const loadSubscription = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const permissionContext = await getPermissionContext(supabase, user);
            const workspaceId = permissionContext.workspaceMembership?.workspaceId;
            if (!workspaceId) return;

            const { data } = await supabase
                .from('subscriptions')
                .select('stripe_price_id')
                .eq('workspace_id', workspaceId)
                .maybeSingle();

            setCurrentPlan(permissionContext.entitlements.plan);
            setSubscriptionStatus(permissionContext.entitlements.status);
            setWorkspaceRole(permissionContext.workspaceMembership?.role ?? null);

            if (typeof data?.stripe_price_id === 'string' && data.stripe_price_id === process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_YEARLY) {
                setBillingInterval('yearly');
            }
        } catch (err) {
            console.error('Error loading subscription:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpgrade = async (plan: PlanId) => {
        if (plan === 'free') return;

        try {
            setUpgrading(true);
            // getSession() already refreshes an expired token internally; an
            // extra refreshSession() on null just burns Supabase auth quota.
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
                body: JSON.stringify({ plan, interval: billingInterval }),
            });

            const data = await response.json();
            if (!response.ok || !data.url) {
                throw new Error(data.error || 'Failed to create checkout session');
            }

            window.location.href = data.url;
        } catch (err) {
            console.error('Error upgrading:', err);
            toast.error('Failed to start checkout');
        } finally {
            setUpgrading(false);
        }
    };

    const handleOpenPortal = async () => {
        try {
            setOpeningPortal(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                throw new Error('No active session. Please sign in again.');
            }
            const response = await fetch('/api/stripe/portal', {
                method: 'POST',
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            const data = await response.json();
            if (!response.ok || !data.url) {
                throw new Error(data.error || 'Failed to open billing portal');
            }

            window.location.href = data.url;
        } catch (err) {
            console.error('Error opening portal:', err);
            toast.error('Failed to open billing portal');
        } finally {
            setOpeningPortal(false);
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
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Manage Subscription</h1>
            <p className="text-gray-500 mb-8">
                Workspace billing and plan management
                {workspaceRole ? ` · Role: ${workspaceRole}` : ''}
            </p>

            <div className="mb-8 p-4 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-purple-600" />
                    <div>
                        <span className="font-medium text-purple-900">Current plan: </span>
                        <span className="text-purple-700 capitalize">{currentPlan}</span>
                        <span className="ml-3 text-sm text-purple-600">Status: {subscriptionStatus}</span>
                    </div>
                </div>
                {currentPlan !== 'free' && (
                    <button
                        onClick={handleOpenPortal}
                        disabled={openingPortal}
                        className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                    >
                        {openingPortal ? 'Opening portal...' : 'Open billing portal'}
                    </button>
                )}
            </div>

            <div className="flex items-center justify-center gap-4 mb-8">
                <button
                    onClick={() => setBillingInterval('monthly')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        billingInterval === 'monthly' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                    Monthly
                </button>
                <button
                    onClick={() => setBillingInterval('yearly')}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        billingInterval === 'yearly' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                    Yearly
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {plans.map((plan) => {
                    const isCurrent = plan.id === currentPlan;
                    return (
                        <div
                            key={plan.id}
                            className={`relative bg-white rounded-xl border-2 p-6 ${plan.id === 'pro' ? 'border-purple-600 shadow-lg' : 'border-gray-200'}`}
                        >
                            {plan.id === 'pro' && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-purple-600 text-white text-xs font-medium rounded-full">
                                    Recommended
                                </div>
                            )}

                            <div className="flex items-center gap-2 mb-2">
                                {plan.id === 'pro' && <Sparkles className="w-5 h-5 text-purple-600" />}
                                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                            </div>
                            <p className="text-sm text-gray-500 mb-4">{plan.description}</p>
                            <div className="mb-6 text-3xl font-bold text-gray-900">
                                {billingInterval === 'yearly' ? plan.yearlyLabel : plan.monthlyLabel}
                            </div>

                            <ul className="space-y-2 mb-6">
                                {plan.features.map((feature) => (
                                    <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>

                            {!isCurrent && plan.id !== 'free' ? (
                                <button
                                    onClick={() => handleUpgrade(plan.id)}
                                    disabled={upgrading}
                                    className="w-full py-2 rounded-lg font-medium transition-colors bg-purple-600 text-white hover:bg-purple-700"
                                >
                                    {upgrading ? 'Starting checkout...' : 'Upgrade'}
                                </button>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
