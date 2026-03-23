"use client";

import * as React from "react";

type InlineCaptionProps = {
    value: string;
    placeholder?: string;
    isEditing: boolean;
    onChange: (next: string) => void;
    onCommit?: () => void;
    color?: string;
    backgroundColor?: string;
    textStyle?: React.CSSProperties;
};

export default function InlineCaption({
    value,
    placeholder = "Write a caption...",
    isEditing,
    onChange,
    onCommit,
    color,
    backgroundColor,
    textStyle,
}: InlineCaptionProps) {
    const ref = React.useRef<HTMLTextAreaElement | null>(null);

    React.useEffect(() => {
        if (isEditing) {
            // Focus without selecting everything (feels more "inline")
            requestAnimationFrame(() => {
                if (ref.current) {
                    ref.current.focus();
                    // Move cursor to end
                    const length = ref.current.value.length;
                    ref.current.setSelectionRange(length, length);
                }
            });
        }
    }, [isEditing]);

    // Handle auto-resize
    React.useEffect(() => {
        if (ref.current) {
            ref.current.style.height = "auto";
            ref.current.style.height = `${ref.current.scrollHeight}px`;
        }
    }, [value, isEditing]);

    return (
        <div className="px-4 pb-4">
            <textarea
                ref={ref}
                value={value}
                placeholder={placeholder}
                readOnly={!isEditing}
                onChange={(e) => {
                    onChange(e.target.value);
                }}
                onBlur={() => onCommit?.()}
                onMouseDown={(e) => e.stopPropagation()}
                className={[
                    "w-full",
                    "bg-transparent",
                    "appearance-none",
                    "border-0",
                    "outline-none",
                    "ring-0",
                    "rounded-none",
                    "p-0",
                    "resize-none",
                    "text-sm",
                    "leading-relaxed",
                    "text-slate-700",
                    "placeholder:text-slate-400",
                    "shadow-none",
                    "focus:outline-none focus:ring-0 focus:border-0",
                    !isEditing ? "cursor-default" : "cursor-text",
                ].join(" ")}
                style={{
                    ...textStyle,
                    color: color || undefined,
                    backgroundColor: backgroundColor || 'transparent'
                }}
                rows={1}
            />
        </div>
    );
}
