'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
    Search,
    LayoutDashboard,
    Settings,
    Users,
    Star,
    Clock,
    Palette,
    Trash2,
    FolderPlus,
    ChevronDown,
    ChevronRight,
    Folder,
    Plus,
    LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface Folder {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    canvasCount?: number;
}

export interface DashboardSidebarProps {
    userName?: string;
    userEmail?: string;
    folders?: Folder[];
    activeFilter?: 'all' | 'recent' | 'mine' | 'favorites' | 'trash';
    onFilterChange?: (filter: 'all' | 'recent' | 'mine' | 'favorites' | 'trash') => void;
    onFolderSelect?: (folderId: string | null) => void;
    selectedFolderId?: string | null;
    onCreateFolder?: () => void;
    onSearch?: (query: string) => void;
    onLogout?: () => void;
    canvasUsage?: { current: number; limit: number | 'unlimited' };
}

// Get greeting based on time of day
function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
}

// Get day name
function getDayGreeting(): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = days[new Date().getDay()];
    return `Happy ${day}!`;
}

export default function DashboardSidebar({
    userName,
    userEmail,
    folders = [],
    activeFilter = 'all',
    onFilterChange,
    onFolderSelect,
    selectedFolderId,
    onCreateFolder,
    onSearch,
    onLogout,
    canvasUsage,
}: DashboardSidebarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [searchQuery, setSearchQuery] = useState('');
    const [isCollectionsExpanded, setIsCollectionsExpanded] = useState(true);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        onSearch?.(e.target.value);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSearch?.(searchQuery);
        }
    };

    // Get first name for greeting
    const firstName = userName?.split(' ')[0] || userName?.split('@')[0] || 'there';

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
        { id: 'settings', label: 'Workspace settings', icon: Settings, href: '/dashboard/settings' },
        { id: 'team', label: 'Team members', icon: Users, href: '/dashboard/settings/members' },
    ];

    const filterItems = [
        { id: 'recent' as const, label: 'Recents', icon: Clock },
        { id: 'mine' as const, label: 'Made by me', icon: Palette },
        { id: 'favorites' as const, label: 'Favorites', icon: Star },
        { id: 'trash' as const, label: 'Trashed', icon: Trash2 },
    ];

    return (
        <div className="w-64 h-screen bg-white border-r border-gray-200 flex flex-col">
            {/* User greeting */}
            <div className="p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Hi {firstName}!</h2>
                <p className="text-sm text-gray-500">{getDayGreeting()}</p>
            </div>

            {/* Search */}
            <div className="p-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search canvases..."
                        value={searchQuery}
                        onChange={handleSearchChange}
                        onKeyDown={handleSearchKeyDown}
                        className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                        ⌘K
                    </span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="px-3 py-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                // If clicking Dashboard, also reset filters to show all canvases
                                if (item.id === 'dashboard') {
                                    onFilterChange?.('all');
                                    onFolderSelect?.(null);
                                }
                                router.push(item.href);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                                isActive
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <item.icon className="w-4 h-4" />
                            {item.label}
                        </button>
                    );
                })}
            </nav>

            <div className="h-px bg-gray-100 mx-3 my-2" />

            {/* Filters */}
            <div className="px-3 py-2 flex-1 overflow-y-auto">
                {filterItems.map((item) => {
                    const isActive = activeFilter === item.id && !selectedFolderId;
                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                onFilterChange?.(item.id);
                                onFolderSelect?.(null);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                                isActive
                                    ? 'bg-gray-100 text-gray-900 font-medium'
                                    : 'text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            <item.icon className="w-4 h-4" />
                            {item.label}
                        </button>
                    );
                })}

                {/* Collections / Folders */}
                <div className="mt-4">
                    <div className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        <button
                            onClick={() => setIsCollectionsExpanded(!isCollectionsExpanded)}
                            className="flex items-center gap-1 hover:text-gray-600"
                        >
                            <span>Collections</span>
                            {isCollectionsExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                            )}
                        </button>
                        {onCreateFolder && (
                            <button
                                onClick={onCreateFolder}
                                className="p-1 hover:bg-gray-100 rounded hover:text-gray-600"
                                title="Create folder"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {isCollectionsExpanded && (
                        <div className="mt-1 space-y-0.5">
                            {folders.length === 0 ? (
                                <button
                                    onClick={onCreateFolder}
                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                                >
                                    <FolderPlus className="w-4 h-4" />
                                    New folder
                                </button>
                            ) : (
                                folders.map((folder) => {
                                    const isActive = selectedFolderId === folder.id;
                                    return (
                                        <button
                                            key={folder.id}
                                            onClick={() => onFolderSelect?.(folder.id)}
                                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                                                isActive
                                                    ? 'bg-gray-100 text-gray-900 font-medium'
                                                    : 'text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            <Folder className="w-4 h-4" style={{ color: folder.color }} />
                                            <span className="flex-1 truncate text-left">{folder.name}</span>
                                            {folder.canvasCount !== undefined && (
                                                <span className="text-xs text-gray-400">{folder.canvasCount}</span>
                                            )}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom section - Usage & Logout */}
            <div className="mt-auto border-t border-gray-100 p-4 space-y-3">
                {/* Usage stats */}
                {canvasUsage && (
                    <div className="text-sm">
                        <div className="flex items-center justify-between text-gray-600 mb-1">
                            <span>Canvases</span>
                            <span>
                                {canvasUsage.current} / {canvasUsage.limit === 'unlimited' ? '∞' : canvasUsage.limit}
                            </span>
                        </div>
                        {canvasUsage.limit !== 'unlimited' && (
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div
                                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                                    style={{
                                        width: `${Math.min((canvasUsage.current / canvasUsage.limit) * 100, 100)}%`
                                    }}
                                />
                            </div>
                        )}
                        <button
                            onClick={() => router.push('/dashboard/settings/billing')}
                            className="text-blue-600 text-xs mt-2 hover:underline"
                        >
                            View plans
                        </button>
                    </div>
                )}

                {/* User email & logout */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 truncate flex-1" title={userEmail}>
                        {userEmail}
                    </span>
                    {onLogout && (
                        <button
                            onClick={onLogout}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Sign out"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
