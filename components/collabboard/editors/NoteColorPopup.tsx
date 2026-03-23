"use client";

import React from 'react';
import { X } from 'lucide-react';
import { ColorPickerContent } from '../ColorPicker';

interface NoteColorPopupProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectBackground: (color: string) => void;
    onSelectTopStrip: (color: string) => void;
    onSelectTextColor: (color: string) => void;
    currentBackground?: string;
    currentTopStrip?: string;
    currentTextColor?: string;
}

const BACKGROUND_COLORS = [
    '#ffffff',
    '#f3f4f6',
    '#fee2e2',
    '#ffedd5',
    '#fef3c7',
    '#dcfce7',
    '#dbeafe',
    '#e0e7ff',
    '#f3e8ff',
    '#fce7f3',
];

const TOP_STRIP_COLORS = [
    'transparent',
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#6b7280',
    '#1f2937',
];

export default function NoteColorPopup({
    isOpen,
    onOpenChange,
    onSelectBackground,
    onSelectTopStrip,
    onSelectTextColor,
    currentBackground = '#FFFFFF',
    currentTopStrip = 'transparent',
    currentTextColor = '#1F2937',
}: NoteColorPopupProps) {
    const [activeTab, setActiveTab] = React.useState<'background' | 'topstrip' | 'text'>('background');

    if (!isOpen) return null;

    const stopProp = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    return (
        <div
            data-no-drag="true"
            onPointerDownCapture={(e) => e.stopPropagation()}
            className="w-[320px] rounded-xl bg-white p-4 shadow-sm border border-gray-200"
            onMouseDown={stopProp}
            onClick={stopProp}
        >
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-800">Card Color</span>
                <button
                    onClick={() => onOpenChange(false)}
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100"
                >
                    <X className="w-3 h-3 text-gray-400" />
                </button>
            </div>

            <div className="mb-3 inline-flex rounded-lg border bg-slate-50 p-1">
                <button
                    onClick={() => setActiveTab('background')}
                    className={[
                        'px-3 py-1 text-xs font-medium rounded-md',
                        activeTab === 'background' ? 'bg-white shadow-sm' : 'text-slate-600',
                    ].join(' ')}
                >
                    Background
                </button>
                <button
                    onClick={() => setActiveTab('topstrip')}
                    className={[
                        'px-3 py-1 text-xs font-medium rounded-md',
                        activeTab === 'topstrip' ? 'bg-white shadow-sm' : 'text-slate-600',
                    ].join(' ')}
                >
                    Top Strip
                </button>
                <button
                    onClick={() => setActiveTab('text')}
                    className={[
                        'px-3 py-1 text-xs font-medium rounded-md',
                        activeTab === 'text' ? 'bg-white shadow-sm' : 'text-slate-600',
                    ].join(' ')}
                >
                    Text
                </button>
            </div>

            <ColorPickerContent
                color={
                    activeTab === 'background'
                        ? currentBackground
                        : activeTab === 'topstrip'
                            ? currentTopStrip
                            : currentTextColor
                }
                onChange={(val) => {
                    if (activeTab === 'background') {
                        onSelectBackground(val);
                        return;
                    }
                    if (activeTab === 'topstrip') {
                        onSelectTopStrip(val);
                        return;
                    }
                    onSelectTextColor(val);
                }}
                hasOpacity={true}
                presets={activeTab === 'background' ? BACKGROUND_COLORS : activeTab === 'topstrip' ? TOP_STRIP_COLORS : undefined}
            />
        </div>
    );
}
