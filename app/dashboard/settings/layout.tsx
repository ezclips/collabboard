'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Settings,
    Users,
    FolderTree,
    Download,
    Upload,
    ScrollText,
    Sparkles,
    CreditCard,
    Receipt,
    User,
    ArrowLeft,
    Lock,
    Bell,
    LayoutDashboard,
    Accessibility,
    Link2,
    Trash2
} from 'lucide-react';

interface NavItem {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
    title: string;
    items: NavItem[];
}

const navigation: NavSection[] = [
    {
        title: 'Workspace Settings',
        items: [
            { href: '/dashboard/settings', label: 'Settings', icon: Settings },
            { href: '/dashboard/settings/members', label: 'Members', icon: Users },
            { href: '/dashboard/settings/collections', label: 'Teams & Collections', icon: FolderTree },
            { href: '/dashboard/settings/export', label: 'Workspace export', icon: Download },
            { href: '/dashboard/settings/import', label: 'Workspace import', icon: Upload },
            { href: '/dashboard/settings/logs', label: 'Logs', icon: ScrollText },
            { href: '/dashboard/settings/ai', label: 'AI', icon: Sparkles },
        ]
    },
    {
        title: 'Subscription',
        items: [
            { href: '/dashboard/settings/billing', label: 'Billing', icon: Receipt },
            { href: '/dashboard/settings/subscription', label: 'Manage Subscription', icon: CreditCard },
        ]
    },
    {
        title: 'Personal account',
        items: [
            { href: '/dashboard/settings/profile', label: 'Basic info', icon: User },
            { href: '/dashboard/settings/password', label: 'Password', icon: Lock },
            { href: '/dashboard/settings/notifications', label: 'Notifications', icon: Bell },
            { href: '/dashboard/settings/dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { href: '/dashboard/settings/accessibility', label: 'Accessibility', icon: Accessibility },
            { href: '/dashboard/settings/integrations', label: 'Integrations', icon: Link2 },
            { href: '/dashboard/settings/delete-account', label: 'Delete account', icon: Trash2 },
        ]
    }
];

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Top header */}
            <header className="bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center gap-4">
                    <Link 
                        href="/dashboard"
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span className="text-sm">Back to Dashboard</span>
                    </Link>
                    <div className="h-4 w-px bg-gray-300" />
                    <div className="flex items-center gap-2">
                        <Settings className="w-5 h-5 text-gray-600" />
                        <span className="font-medium text-gray-900">Workspace Settings</span>
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* Sidebar */}
                <aside className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-65px)] p-4">
                    <nav className="space-y-6">
                        {navigation.map((section) => (
                            <div key={section.title}>
                                <h3 className="px-3 text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">
                                    {section.title}
                                </h3>
                                <ul className="space-y-1">
                                    {section.items.map((item) => {
                                        const isActive = pathname === item.href || 
                                            (item.href !== '/dashboard/settings' && pathname?.startsWith(item.href));
                                        const Icon = item.icon;
                                        
                                        return (
                                            <li key={item.href}>
                                                <Link
                                                    href={item.href}
                                                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                                                        isActive
                                                            ? 'bg-purple-50 text-purple-700 font-medium border border-purple-200'
                                                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                                    }`}
                                                >
                                                    <Icon className={`w-4 h-4 ${isActive ? 'text-purple-600' : 'text-gray-400'}`} />
                                                    {item.label}
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                    </nav>
                </aside>

                {/* Main content */}
                <main className="flex-1 p-8">
                    <div className="w-full max-w-[1400px]">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
