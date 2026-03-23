import React, { useContext, useState } from 'react';
import { Network, Layout, Settings, Link2 } from 'lucide-react';
import { FreeformModalContext } from './FreeformModalHost';

interface FreeformGraphToolbarProps {
    onOrganize?: () => void | Promise<void>;
    onOpenSettings?: () => void;
    onToggleConnect?: () => void;
    isConnectMode?: boolean;
    connectSourceTitle?: string | null;
    isAutoLayout?: boolean;
}

export function FreeformGraphToolbar({
    onOrganize,
    onOpenSettings,
    onToggleConnect,
    isConnectMode = false,
    connectSourceTitle = null,
    isAutoLayout = false,
}: FreeformGraphToolbarProps) {
    const dispatch = useContext(FreeformModalContext);
    const [isOrganizing, setIsOrganizing] = useState(false);

    const handleOpenSettings = () => {
        if (onOpenSettings) onOpenSettings();
        dispatch({ type: 'OPEN_GRAPH_SETTINGS' });
    };

    const handleOrganize = async () => {
        if (!onOrganize || isOrganizing) return;
        try {
            setIsOrganizing(true);
            await onOrganize();
        } finally {
            setIsOrganizing(false);
        }
    };

    return (
        <div className="fixed bottom-6 top-auto left-1/2 transform -translate-x-1/2 bg-white rounded-xl shadow-lg border border-gray-200 px-4 py-2 flex items-center gap-3 z-[5000]">
            <div className="flex items-center gap-1 border-r border-gray-200 pr-3">
                <Network className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-semibold text-gray-800 ml-1">Graph Mode</span>
            </div>

            <button
                onClick={onToggleConnect}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-sm font-medium ${isConnectMode ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}
                title={isConnectMode ? 'Connect mode is on' : 'Connect cards'}
            >
                <Link2 className={`w-4 h-4 ${isConnectMode ? 'text-blue-600' : 'text-gray-500'}`} />
                {connectSourceTitle ? 'Pick Target' : 'Connect'}
            </button>

            <button
                onClick={handleOrganize}
                disabled={!onOrganize || isOrganizing}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition text-sm font-medium text-gray-700"
                title="Organize Layout"
            >
                <Layout className="w-4 h-4 text-gray-500" />
                {isOrganizing ? 'Organizing...' : (isAutoLayout ? 'Auto' : 'Organize')}
            </button>

            <button
                onClick={handleOpenSettings}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition text-sm font-medium text-gray-700"
                title="Graph Settings"
            >
                <Settings className="w-4 h-4 text-gray-500" />
                Settings
            </button>

            <div className="pl-2 border-l border-gray-200">
                <span className="text-xs text-gray-400">NEXT_PUBLIC_ENABLE_FREEFORM_GRAPH</span>
            </div>
        </div>
    );
}
