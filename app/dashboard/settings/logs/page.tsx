'use client';

import React, { useState, useEffect } from 'react';
import { ScrollText, Filter, Loader2, Search, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/infra/supabase/currentUser';

interface LogEntry {
    id: string;
    action: string;
    actor_email: string;
    target_type: string;
    target_name: string;
    details?: Record<string, any>;
    created_at: string;
}

const actionLabels: Record<string, { label: string; color: string }> = {
    'board.create': { label: 'Created board', color: 'text-green-600' },
    'board.update': { label: 'Updated board', color: 'text-blue-600' },
    'board.delete': { label: 'Deleted board', color: 'text-red-600' },
    'padlet.create': { label: 'Created padlet', color: 'text-green-600' },
    'padlet.update': { label: 'Updated padlet', color: 'text-blue-600' },
    'padlet.delete': { label: 'Deleted padlet', color: 'text-red-600' },
    'member.invite': { label: 'Invited member', color: 'text-purple-600' },
    'member.remove': { label: 'Removed member', color: 'text-red-600' },
    'settings.update': { label: 'Updated settings', color: 'text-blue-600' },
};

export default function LogsPage() {
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterAction, setFilterAction] = useState<string>('all');
    const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        try {
            setLoading(true);
            const userResult = await getCurrentUser();
            if (!userResult.ok) throw userResult.error;

            const user = userResult.value;
            if (!user) return;

            // In a real app, you'd have an activity_logs table
            // For now, we'll show mock data
            const mockLogs: LogEntry[] = [
                {
                    id: '1',
                    action: 'board.create',
                    actor_email: user.email ?? '',
                    target_type: 'board',
                    target_name: 'New Project Board',
                    created_at: new Date().toISOString()
                },
                {
                    id: '2',
                    action: 'padlet.create',
                    actor_email: user.email ?? '',
                    target_type: 'padlet',
                    target_name: 'Welcome Note',
                    details: { board: 'New Project Board', type: 'note' },
                    created_at: new Date(Date.now() - 3600000).toISOString()
                },
                {
                    id: '3',
                    action: 'settings.update',
                    actor_email: user.email ?? '',
                    target_type: 'settings',
                    target_name: 'Workspace Settings',
                    details: { changed: ['workspace_name'] },
                    created_at: new Date(Date.now() - 86400000).toISOString()
                }
            ];

            setLogs(mockLogs);
        } catch (err) {
            console.error('Error loading logs:', err);
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (id: string) => {
        const newExpanded = new Set(expandedLogs);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedLogs(newExpanded);
    };

    const filteredLogs = logs.filter(log => {
        const matchesSearch = !searchQuery || 
            log.target_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.actor_email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filterAction === 'all' || log.action === filterAction;
        return matchesSearch && matchesFilter;
    });

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
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
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Activity Logs</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        View all activity in your workspace
                    </p>
                </div>
                <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Export Logs
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search logs..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                </div>
                <select
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                    <option value="all">All Actions</option>
                    <option value="board.create">Board Created</option>
                    <option value="board.update">Board Updated</option>
                    <option value="board.delete">Board Deleted</option>
                    <option value="padlet.create">Padlet Created</option>
                    <option value="settings.update">Settings Updated</option>
                </select>
            </div>

            {/* Logs List */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {filteredLogs.length === 0 ? (
                    <div className="p-12 text-center">
                        <ScrollText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-lg font-medium text-gray-900 mb-1">No logs found</h3>
                        <p className="text-gray-500">Activity will appear here as you use your workspace</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {filteredLogs.map((log) => {
                            const actionInfo = actionLabels[log.action] || { label: log.action, color: 'text-gray-600' };
                            const isExpanded = expandedLogs.has(log.id);
                            
                            return (
                                <div key={log.id} className="p-4 hover:bg-gray-50">
                                    <div className="flex items-start gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-medium ${actionInfo.color}`}>
                                                    {actionInfo.label}
                                                </span>
                                                <span className="text-gray-900">"{log.target_name}"</span>
                                            </div>
                                            <div className="text-sm text-gray-500 mt-1">
                                                by {log.actor_email} • {formatDate(log.created_at)}
                                            </div>
                                            
                                            {/* Details */}
                                            {log.details && (
                                                <div className="mt-2">
                                                    <button
                                                        onClick={() => toggleExpand(log.id)}
                                                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
                                                    >
                                                        {isExpanded ? (
                                                            <ChevronDown className="w-4 h-4" />
                                                        ) : (
                                                            <ChevronRight className="w-4 h-4" />
                                                        )}
                                                        Details
                                                    </button>
                                                    {isExpanded && (
                                                        <pre className="mt-2 p-3 bg-gray-100 rounded-lg text-xs text-gray-600 overflow-x-auto">
                                                            {JSON.stringify(log.details, null, 2)}
                                                        </pre>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-400">
                                            {new Date(log.created_at).toLocaleTimeString()}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {filteredLogs.length > 0 && (
                <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                    <span>Showing {filteredLogs.length} entries</span>
                    <div className="flex items-center gap-2">
                        <button className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50" disabled>
                            Previous
                        </button>
                        <button className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50" disabled>
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
