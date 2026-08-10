"use client";

import * as React from "react";

type InlineCaptionProps = {
    value: string;
    placeholder?: string;
    isEditing: boolean;
    onChange: (next: string) => void;
    onCommit?: () => void;
    onFocus?: () => void;
    // Fires whenever the field has a real (non-collapsed) text selection --
    // even while read-only, since a readOnly textarea still allows
    // selecting text. Callers use this to auto-open the Text style panel
    // when the user highlights caption text, same as the title input.
    onTextSelect?: () => void;
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
    onFocus,
    onTextSelect,
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
                    // Only collapse the cursor to the end when there's no
                    // existing selection to preserve -- entering edit mode
                    // can now be triggered BY highlighting text (onTextSelect
                    // below), and that highlight must survive the transition
                    // instead of being wiped out here.
                    if (ref.current.selectionStart === ref.current.selectionEnd) {
                        const length = ref.current.value.length;
                        ref.current.setSelectionRange(length, length);
                    }
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

    // The placeholder is an editing affordance ("click here to add a
    // caption"), not something to show on the static canvas tile -- an
    // empty, non-editing caption renders nothing at all.
    if (!isEditing && !value) {
        return null;
    }

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
                onFocus={() => onFocus?.()}
                onBlur={() => onCommit?.()}
                onMouseDown={(e) => e.stopPropagation()}
                onSelect={(e) => {
                    const el = e.currentTarget;
                    if (el.selectionStart !== el.selectionEnd) onTextSelect?.();
                }}
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
