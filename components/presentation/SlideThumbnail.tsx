"use client";

import React from "react";

export function SlideThumbnail({
  pngDataUrl,
  width,
  height,
  isActive,
}: {
  pngDataUrl: string | null;
  width: number;
  height: number;
  isActive?: boolean;
}) {
  return (
    <div
      className={[
        "relative rounded-lg bg-white overflow-hidden border",
        isActive ? "border-violet-300" : "border-gray-200",
      ].join(" ")}
      style={{ width: "100%", paddingBottom: `${(height / width) * 100}%` }}
    >
      {pngDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pngDataUrl}
          alt="Slide preview"
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
          Preview…
        </div>
      )}
    </div>
  );
}
