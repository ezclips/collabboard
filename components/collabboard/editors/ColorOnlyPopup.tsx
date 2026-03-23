"use client";

import React from 'react';

interface ColorOnlyPopupProps {
    currentColor: string;
    currentHighlight: string;
    onSelectColor: (color: string) => void;
    onSelectHighlight: (color: string) => void;
}

const colors = [
    { name: 'Default', value: '#1f2937' },
    { name: 'Red', value: '#dc2626' },
    { name: 'Orange', value: '#ea580c' },
    { name: 'Green', value: '#16a34a' },
    { name: 'Teal', value: '#0d9488' },
    { name: 'Blue', value: '#2563eb' },
    { name: 'Purple', value: '#9333ea' },
];

const highlights = [
    { name: 'Default', value: 'transparent', bgColor: '#ffffff' },
    { name: 'Red', value: '#fecaca', bgColor: '#fecaca' },
    { name: 'Orange', value: '#fed7aa', bgColor: '#fed7aa' },
    { name: 'Yellow', value: '#fef08a', bgColor: '#fef08a' },
    { name: 'Green', value: '#bbf7d0', bgColor: '#bbf7d0' },
    { name: 'Teal', value: '#99f6e4', bgColor: '#99f6e4' },
    { name: 'Purple', value: '#e9d5ff', bgColor: '#e9d5ff' },
];

export default function ColorOnlyPopup({
    currentColor,
    currentHighlight,
    onSelectColor,
    onSelectHighlight,
}: ColorOnlyPopupProps) {
    return (
        <div className="space-y-4">
            {/* Color Section */}
            <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Color</p>
                <div className="flex flex-wrap gap-2">
                    {colors.map((color) => (
                        <button
                            key={color.value}
                            onClick={() => onSelectColor(color.value)}
                            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${currentColor === color.value
                                    ? 'border-blue-500 scale-110 shadow-sm'
                                    : 'border-gray-100 hover:border-gray-300'
                                }`}
                            title={color.name}
                        >
                            <span
                                className="text-sm font-bold"
                                style={{ color: color.value }}
                            >
                                A
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Highlight Section */}
            <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Highlight</p>
                <div className="flex flex-wrap gap-2">
                    {highlights.map((highlight) => (
                        <button
                            key={highlight.value}
                            onClick={() => onSelectHighlight(highlight.value)}
                            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${currentHighlight === highlight.value
                                    ? 'border-blue-500 scale-110 shadow-sm'
                                    : 'border-gray-100 hover:border-gray-300'
                                }`}
                            style={{ backgroundColor: highlight.bgColor }}
                            title={highlight.name}
                        >
                            <span className="text-sm font-bold text-gray-800">
                                A
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
