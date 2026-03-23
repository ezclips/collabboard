import React from 'react';
import { ColorPickerContent } from '../ColorPicker';
import { X } from 'lucide-react';

type CardColorTarget = "icon" | "bg" | "ts";

// Color palette matching other editors
const BACKGROUND_COLORS = [
    "#ffffff",
    "#f3f4f6",
    "#fee2e2",
    "#ffedd5",
    "#fef3c7",
    "#dcfce7",
    "#dbeafe",
    "#e0e7ff",
    "#f3e8ff",
    "#fce7f3",
];

const TOP_STRIP_COLORS = [
    "transparent",
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#6b7280",
    "#1f2937",
];

export function CardColorPanel({
    iconColor,
    bgColor,
    topStrip,
    onChangeTarget,
    onClose,
}: {
    iconColor?: string;          // e.g. metadata.iconColor
    bgColor?: string;            // e.g. metadata.cardColor
    topStrip?: string;           // e.g. metadata.topStrip
    onChangeTarget: (target: CardColorTarget, value: string) => void;
    onClose?: () => void;
}) {
    const [tab, setTab] = React.useState<CardColorTarget>("bg");

    return (
        <div
            data-no-drag="true"
            onPointerDownCapture={(e) => e.stopPropagation()}
            className="w-[320px] min-h-[300px] rounded-xl bg-white p-4 shadow-sm"
        >
            <div className="mb-3 grid items-center gap-3" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
                <div className="text-sm font-semibold text-slate-800">Card Color</div>
                <div className="inline-flex rounded-lg border bg-slate-50 p-1">
                    <button
                        type="button"
                        onClick={() => setTab("icon")}
                        className={[
                            "px-3 py-1 text-xs font-medium rounded-md",
                            tab === "icon" ? "bg-white shadow-sm" : "text-slate-600",
                        ].join(" ")}
                    >
                        Icon
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab("bg")}
                        className={[
                            "px-3 py-1 text-xs font-medium rounded-md",
                            tab === "bg" ? "bg-white shadow-sm" : "text-slate-600",
                        ].join(" ")}
                    >
                        BG
                    </button>
                    <button
                        type="button"
                        onClick={() => setTab("ts")}
                        className={[
                            "px-3 py-1 text-xs font-medium rounded-md",
                            tab === "ts" ? "bg-white shadow-sm" : "text-slate-600",
                        ].join(" ")}
                    >
                        TS
                    </button>
                </div>
                <div className="flex justify-end">
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="self-center w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            aria-label="Close color picker"
                            title="Close"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* NEW palette component you already have */}
            <ColorPickerContent
                color={
                    tab === "icon"
                        ? (iconColor ?? "#ffffff")
                        : tab === "bg"
                            ? (bgColor ?? "#ffffff")
                            : (topStrip ?? "transparent")
                }
                onChange={(val) => onChangeTarget(tab, val)}
                // Show opacity for all tabs (icon, bg, strip) so users can use alpha
                hasOpacity={true}
                presets={tab === "bg" ? BACKGROUND_COLORS : TOP_STRIP_COLORS}
            />
        </div>
    );
}
