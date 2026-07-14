'use client';

import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { getBoardLimitForEntitlements, getPermissionContext } from '@/lib/auth/permissions';
import { useSupabase } from '@/lib/supabase-provider';
import type { WorkspaceRole, SubscriptionStatus } from '@/types/permissions';

interface PlanTier {
    id: 'free' | 'pro';
    name: string;
    features: string[];
    priceMonthly: string;
    priceYearly: string;
    yearlySavings?: string;
}

const plans: PlanTier[] = [
    {
        id: 'pro',
        name: 'Pro',
        features: ['Unlimited boards', 'Workspace billing', 'Advanced collaboration'],
        priceMonthly: '$9.99 /month',
        priceYearly: '$99 /year',
        yearlySavings: 'Save 17%'
    },
    {
        id: 'free',
        name: 'Free',
        features: ['Basic collaboration', 'Workspace access'],
        priceMonthly: 'Free',
        priceYearly: ''
    }
];

export default function BillingPage() {
    const { supabase } = useSupabase();
    const [loading, setLoading] = useState(true);
    const [currentPlan, setCurrentPlan] = useState<'free' | 'pro'>('free');
    const [currentStatus, setCurrentStatus] = useState<SubscriptionStatus>('free');
    const [boardsUsed, setBoardsUsed] = useState(0);
    const [workspaceRole, setWorkspaceRole] = useState<WorkspaceRole | null>(null);
    const [openingPortal, setOpeningPortal] = useState(false);
    const [startingCheckout, setStartingCheckout] = useState(false);

    useEffect(() => {
        void loadBillingData();
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
            const data = await response.json();
            if (!response.ok || !data.url) {
                throw new Error(data.error || 'Failed to open billing portal');
            }
            window.location.href = data.url;
        } catch (err) {
            console.error('Error opening billing portal:', err);
            toast.error('Failed to open billing portal');
        } finally {
            setOpeningPortal(false);
        }
    };

    const startCheckout = async () => {
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
                body: JSON.stringify({ plan: 'pro', interval: 'monthly' }),
            });
            const data = await response.json();
            if (!response.ok || !data.url) {
                throw new Error(data.error || 'Failed to start checkout');
            }
            window.location.href = data.url;
        } catch (err) {
            console.error('Error starting checkout:', err);
            toast.error('Failed to start checkout');
        } finally {
            setStartingCheckout(false);
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

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {plans.map((plan) => {
                    const isCurrent = currentPlan === plan.id;
                    return (
                        <div key={plan.id} className="px-6 py-5 flex items-center justify-between">
                            <div className="flex items-center gap-8">
                                <div className="w-24">
                                    <span className="font-semibold text-gray-900">{plan.name}</span>
                                    {isCurrent && <Check className="w-4 h-4 text-purple-600 inline ml-1" />}
                                </div>
                                <div className="text-gray-600 text-sm">{plan.features.join(' · ')}</div>
                            </div>

                            <div className="flex items-center gap-8">
                                <div className="text-right">
                                    <div className="text-gray-900">{plan.priceMonthly}</div>
                                    {plan.priceYearly && (
                                        <div className="text-sm text-gray-500">
                                            {plan.priceYearly}
                                            {plan.yearlySavings && (
                                                <span className="ml-2 px-1.5 py-0.5 text-xs font-medium bg-yellow-200 text-yellow-800 rounded">
                                                    {plan.yearlySavings}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="w-36 text-right">
                                    {isCurrent ? (
                                        <div className="text-sm text-purple-600">
                                            {plan.id === 'free'
                                                ? `${boardsUsed} / ${getBoardLimitForEntitlements({ plan: currentPlan, status: currentStatus })} boards`
                                                : `Status: ${currentStatus}`}
                                        </div>
                                    ) : (
                                        <button
                                            onClick={startCheckout}
                                            disabled={startingCheckout}
                                            className="px-5 py-2 bg-pink-500 text-white rounded-full font-medium text-sm hover:bg-pink-600 transition-colors"
                                        >
                                            {startingCheckout ? 'Starting...' : 'Upgrade'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {currentPlan !== 'free' && (
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
