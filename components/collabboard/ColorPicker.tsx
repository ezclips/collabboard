import React, { useState, useEffect } from 'react';
import { Check, ChevronDown, Pipette } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';

// Standard Excalidraw-like palette
const PRESET_COLORS = [
    '#ffffff', // White
    '#f8f9fa', // Gray 0
    '#e9ecef', // Gray 1
    '#dee2e6', // Gray 2
    '#ced4da', // Gray 3
    '#adb5bd', // Gray 4
    '#868e96', // Gray 5
    '#495057', // Gray 6
    '#343a40', // Gray 7
    '#212529', // Gray 8
    '#000000', // Black

    '#ffc9c9', // Red 0
    '#ff8787', // Red 1
    '#fa5252', // Red 2
    '#e03131', // Red 3
    '#c92a2a', // Red 4

    '#fcc419', // Yellow 0
    '#fab005', // Yellow 1
    '#f59f00', // Yellow 2
    '#f08c00', // Yellow 3
    '#e67700', // Yellow 4

    '#b2f2bb', // Green 0
    '#69db7c', // Green 1
    '#40c057', // Green 2
    '#2f9e44', // Green 3
    '#2b8a3e', // Green 4

    '#a5d8ff', // Blue 0
    '#74c0fc', // Blue 1
    '#4dabf7', // Blue 2
    '#339af0', // Blue 3
    '#228be6', // Blue 4

    '#eebefa', // Grape 0
    '#da77f2', // Grape 1
    '#cc5de8', // Grape 2
    '#be4bdb', // Grape 3
    '#ae3ec9', // Grape 4
];

const SIMPLE_PALETTE = [
    '#ffffff', '#f8f9fa', '#e9ecef', '#868e96', '#212529',
    '#fa5252', '#e64980', '#be4bdb', '#7950f2', '#4c6ef5',
    '#228be6', '#15aabf', '#12b886', '#40c057', '#82c91e',
    '#fab005', '#fd7e14'
];

interface ColorPickerProps {
    color: string;
    onChange: (color: string) => void;
    label?: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    hasOpacity?: boolean;
}

interface ColorPickerContentProps {
    color: string;
    onChange: (color: string) => void;
    hasOpacity?: boolean;
    presets?: string[];
}

// Exported content component for use with custom triggers
export function ColorPickerContent({
    color,
    onChange,
    hasOpacity = false,
    presets = SIMPLE_PALETTE
}: ColorPickerContentProps) {
    const [hex, setHex] = useState(color);
    const [opacity, setOpacity] = useState(100);

    // Track valid hex for the color input (fallback for transparency)
    const [colorInputValue, setColorInputValue] = useState(
        (color && color !== 'transparent' && color !== 'TRANSP' && /^#[0-9A-Fa-f]{6}/.test(color))
            ? color.slice(0, 7)
            : '#000000'
    );

    // Parse opacity from hex if present (e.g. #RRGGBBAA)
    useEffect(() => {
        let nextHex = color;

        // Handle transparency
        if (
            !color ||
            color === 'transparent' ||
            color === 'TRANSP' ||
            (color.startsWith('rgba') && color.includes(', 0)'))
        ) {
            nextHex = 'TRANSP';
            setOpacity(0);
        } else if (color.length === 9) {
            const alpha = parseInt(color.slice(7), 16);
            setOpacity(Math.round((alpha / 255) * 100));
        } else {
            setOpacity(100);
        }

        setHex(nextHex);

        // Update the color input value only if it's a valid hex
        if (nextHex.startsWith('#') && nextHex.length >= 7) {
            setColorInputValue(nextHex.slice(0, 7));
        }
    }, [color]);

    const handleColorSelect = (baseColor: string) => {
        // If selecting specific transparency
        if (baseColor === 'transparent') {
            onChange('transparent');
            setHex('TRANSP');
            setOpacity(0);
            return;
        }

        // If currently transparent, default to fully opaque for new selections
        const nextOpacity = hasOpacity && opacity === 0 ? 100 : opacity;
        if (nextOpacity !== opacity) {
            setOpacity(nextOpacity);
        }

        // Apply current opacity to new color
        const alphaHex = Math.round((nextOpacity / 100) * 255).toString(16).padStart(2, '0');
        const finalColor = hasOpacity && nextOpacity < 100 ? `${baseColor.slice(0, 7)}${alphaHex}` : baseColor.slice(0, 7);
        onChange(finalColor);

        // Update local state immediately for responsiveness
        setHex(hasOpacity && nextOpacity < 100 ? `${baseColor.slice(0, 7).toUpperCase()}...` : baseColor.slice(0, 7));
        setColorInputValue(baseColor.slice(0, 7));
    };

    const handleOpacityChange = (val: number) => {
        setOpacity(val);
        if (val === 0) {
            setOpacity(0);
            setHex('TRANSP');
            onChange('transparent');
            return;
        }
        // If currently transparent/TRANSP, we need a base color to apply opacity to. 
        // Use current color input value.
        const baseColor = colorInputValue;

        const alphaHex = Math.round((val / 100) * 255).toString(16).padStart(2, '0');
        const finalColor = val < 100 ? `${baseColor}${alphaHex}` : baseColor;
        onChange(finalColor);
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Custom Hex Input */}
            <div className="flex gap-2 items-center">
                <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg" style={{ width: 100 }}>
                    <span className="text-gray-400 text-xs">#</span>
                    <input
                        type="text"
                        value={hex.replace('#', '').slice(0, 6)}
                        onChange={(e) => {
                            const val = '#' + e.target.value;
                            setHex(val);
                            if (/^#[0-9A-F]{6}$/i.test(val)) {
                                handleColorSelect(val);
                            }
                        }}
                        className="w-full bg-transparent border-none outline-none text-xs font-mono uppercase"
                        maxLength={6}
                    />
                </div>
                <input
                    type="color"
                    value={colorInputValue}
                    onChange={(e) => handleColorSelect(e.target.value)}
                    className="w-8 h-8 p-0 border border-gray-200 rounded cursor-pointer flex-shrink-0"
                />
            </div>

            {/* Presets Grid */}
            <div>
                <div className="text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Default Colors</div>
                <div className="grid grid-cols-7 gap-1">
                    {presets.map((c) => (
                        <button
                            key={c}
                            onClick={() => handleColorSelect(c)}
                            className={`w-6 h-6 rounded-md border transition-all hover:scale-110 ${color.startsWith(c) ? 'border-blue-500 ring-1 ring-blue-500 z-10' : 'border-gray-200 hover:border-gray-300'}`}
                            style={{ backgroundColor: c === 'transparent' ? '#ffffff' : c }}
                            title={c}
                        >

                            {c === 'transparent' && <span className="text-red-500 text-xs text-center block" style={{ lineHeight: '100%' }}>/</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* Opacity Slider */}
            {hasOpacity && (
                <div>
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Opacity</span>
                        <span className="text-xs text-gray-500 font-mono">{opacity}%</span>
                    </div>

                    {/* ✅ Wrapper blocks parent drag, slider stays native */}
                    <div
                        data-no-drag="true"
                        onPointerDownCapture={(e) => e.stopPropagation()}
                        className="relative w-full h-6"
                    >  {/* ← taller hit zone */}
                        {/* Track background (gray, unfilled part) */}
                        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 bg-gray-200 rounded-lg overflow-hidden pointer-events-none">
                            {/* Filled portion (0% to current opacity) with gradient */}
                            <div
                                className="absolute inset-y-0 left-0 rounded-l-lg"
                                style={{
                                    width: `${opacity}%`,
                                    background: `linear-gradient(to right, transparent, ${colorInputValue})`
                                }}
                            />
                        </div>

                        {/* Interactive range input */}
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={opacity}
                            onChange={(e) => handleOpacityChange(parseInt(e.target.value))}
                            className="
                                absolute inset-0 w-full h-full
                                appearance-none cursor-pointer bg-transparent
                                pointer-events-auto
                                [&::-webkit-slider-thumb]:appearance-none
                                [&::-webkit-slider-thumb]:w-5
                                [&::-webkit-slider-thumb]:h-5
                                [&::-webkit-slider-thumb]:rounded-full
                                [&::-webkit-slider-thumb]:bg-blue-600
                                [&::-webkit-slider-thumb]:border-2
                                [&::-webkit-slider-thumb]:border-white
                                [&::-webkit-slider-thumb]:shadow-md
                                [&::-webkit-slider-thumb]:-mt-0.5   /* centers bigger thumb */
                                [&::-moz-range-thumb]:w-5
                                [&::-moz-range-thumb]:h-5
                                [&::-moz-range-thumb]:rounded-full
                                [&::-moz-range-thumb]:bg-blue-600
                                [&::-moz-range-thumb]:border-2
                                [&::-moz-range-thumb]:border-white
                                [&::-moz-range-thumb]:shadow-md
                            "
                            style={{ touchAction: "none" }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ColorPicker({
    color,
    onChange,
    label,
    position = 'bottom',
    hasOpacity = false
}: ColorPickerProps) {
    const [hex, setHex] = useState(color);
    const [opacity, setOpacity] = useState(100);

    // Parse opacity from hex if present (e.g. #RRGGBBAA)
    useEffect(() => {
        setHex(color);
        if (color.length === 9) {
            const alpha = parseInt(color.slice(7), 16);
            setOpacity(Math.round((alpha / 255) * 100));
        } else {
            setOpacity(100);
        }
    }, [color]);

    const handleColorSelect = (baseColor: string) => {
        // Apply current opacity to new color
        const alphaHex = Math.round((opacity / 100) * 255).toString(16).padStart(2, '0');
        const finalColor = hasOpacity && opacity < 100 ? `${baseColor.slice(0, 7)}${alphaHex}` : baseColor.slice(0, 7);
        onChange(finalColor);
    };

    const handleOpacityChange = (val: number) => {
        setOpacity(val);
        if (val === 0) {
            onChange('transparent');
            return;
        }
        const baseColor = hex.slice(0, 7);
        const alphaHex = Math.round((val / 100) * 255).toString(16).padStart(2, '0');
        const finalColor = val < 100 ? `${baseColor}${alphaHex}` : baseColor;
        onChange(finalColor);
    };

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100 border border-transparent hover:border-gray-200 transition-all text-sm group"
                >
                    <div className="flex items-center gap-2">
                        <div
                            className="w-4 h-4 rounded-full border border-gray-200 shadow-sm"
                            style={{ backgroundColor: color }}
                        />
                        {label && <span className="text-gray-600 font-medium">{label}</span>}
                    </div>
                </button>
            </Popover.Trigger>

            <Popover.Portal>
                <Popover.Content
                    className="z-[250] w-64 p-3 bg-white rounded-xl shadow-2xl border border-gray-200 animate-in fade-in zoom-in duration-200"
                    side={position}
                    sideOffset={5}
                >
                    <div className="flex flex-col gap-3">
                        {/* Custom Hex Input */}
                        <div className="flex gap-2">
                            <div className="flex-1 flex items-center gap-2 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg">
                                <span className="text-gray-400 text-xs">#</span>
                                <input
                                    type="text"
                                    value={hex.replace('#', '').slice(0, 6)}
                                    onChange={(e) => {
                                        const val = '#' + e.target.value;
                                        setHex(val);
                                        if (/^#[0-9A-F]{6}$/i.test(val)) {
                                            handleColorSelect(val);
                                        }
                                    }}
                                    className="flex-1 bg-transparent border-none outline-none text-xs font-mono uppercase"
                                    maxLength={6}
                                />
                            </div>
                            <input
                                type="color"
                                value={hex.slice(0, 7)}
                                onChange={(e) => handleColorSelect(e.target.value)}
                                className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                            />
                        </div>

                        {/* Presets Grid */}
                        <div>
                            <div className="text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Default Colors</div>
                            <div className="grid grid-cols-7 gap-1">
                                {SIMPLE_PALETTE.map((c) => (
                                    <button
                                        key={c}
                                        onClick={() => handleColorSelect(c)}
                                        className={`w-6 h-6 rounded-md border transition-all hover:scale-110 ${color.startsWith(c) ? 'border-blue-500 ring-1 ring-blue-500 z-10' : 'border-gray-200 hover:border-gray-300'}`}
                                        style={{ backgroundColor: c }}
                                        title={c}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Opacity Slider */}
                        {hasOpacity && (
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Opacity</span>
                                    <span className="text-xs text-gray-500 font-mono">{opacity}%</span>
                                </div>
                                <div className="relative w-full h-2 bg-gray-200 rounded-lg overflow-hidden">
                                    <div
                                        className="absolute inset-0 rounded-lg"
                                        style={{
                                            background: `linear-gradient(to right, transparent, ${hex.slice(0, 7)})`
                                        }}
                                    />
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="5"
                                        value={opacity}
                                        onChange={(e) => handleOpacityChange(parseInt(e.target.value))}
                                        className="absolute inset-0 w-full h-full appearance-none cursor-pointer bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <Popover.Arrow className="fill-white" />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
