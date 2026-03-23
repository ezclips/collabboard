"use client";

import React, { useMemo, useRef, useState } from "react";
import type { FrameSlide, RenderSlideToPNG } from "./PresentationPanel";
import { exportSlidesToPDF } from "./exporters/exportToPDF";
import { exportSlidesToPPTX } from "./exporters/exportToPPTX";

export function ExportMenu({
  slides,
  selectedSlideIds,
  renderSlideToPNG,
}: {
  slides: FrameSlide[];
  selectedSlideIds: string[];
  renderSlideToPNG: RenderSlideToPNG;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "pdf" | "pptx">(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedSlides = useMemo(() => {
    const set = new Set(selectedSlideIds);
    return slides.filter((s) => set.has(s.id));
  }, [slides, selectedSlideIds]);

  const disabled = selectedSlides.length === 0 || !!busy;

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const doExportPDF = async () => {
    setBusy("pdf");
    try {
      await exportSlidesToPDF({
        slides: selectedSlides,
        renderSlideToPNG,
        fileName: "presentation.pdf",
      });
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  const doExportPPTX = async () => {
    setBusy("pptx");
    try {
      await exportSlidesToPPTX({
        slides: selectedSlides,
        renderSlideToPNG,
        fileName: "presentation.pptx",
      });
    } catch (err) {
      console.error("PPTX export failed:", err);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!!busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-sm disabled:opacity-50"
      >
        {busy ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            Exporting…
          </>
        ) : (
          <>
            Export
            <span className="text-xs text-gray-500">({selectedSlides.length})</span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[220px] rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-100 font-medium">
            Export {selectedSlides.length} slide{selectedSlides.length !== 1 ? "s" : ""}
          </div>

          <button
            type="button"
            onClick={doExportPDF}
            disabled={disabled}
            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 disabled:opacity-50 text-sm flex items-center gap-2"
          >
            <span className="text-base">📄</span>
            {busy === "pdf" ? "Exporting PDF…" : "Export as PDF"}
          </button>

          <button
            type="button"
            onClick={doExportPPTX}
            disabled={disabled}
            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 disabled:opacity-50 text-sm flex items-center gap-2"
          >
            <span className="text-base">📊</span>
            {busy === "pptx" ? "Exporting PPTX…" : "Export as PowerPoint"}
          </button>

          <div className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100">
            Slides are rendered as images at 1920×1080.
          </div>
        </div>
      )}
    </div>
  );
}
