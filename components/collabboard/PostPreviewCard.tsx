"use client";

import React from "react";
import ContainerChildPreviewCard from "@/components/collabboard/ContainerChildPreviewCard";
import type { Padlet } from "@/types/collabboard";

type Props = {
    padlet: Padlet;
    className?: string;
};

/**
 * Canonical preview renderer used everywhere:
 * - container children
 * - setup previews
 * - dashboard previews
 * - drag overlay
 *
 * Matches ContainerChildPreviewCard visuals exactly.
 * 
 * ARCHITECTURE RULE: This is the ONLY renderer allowed in:
 * - lib/collabboard/layouts/*
 * - *Preview* files
 * Do NOT use PostCardContent or SafeHtmlContent in those contexts.
 */
export default function PostPreviewCard({ padlet, className }: Props) {
    // Dev-only assertion to catch wiring mistakes
    if (process.env.NODE_ENV === "development") {
        if (!padlet?.id) {
            console.warn("PostPreviewCard received invalid padlet", padlet);
        }
    }

    return <ContainerChildPreviewCard padlet={padlet} className={className} />;
}
