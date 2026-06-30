"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PresentationPreviewModal } from "./PresentationPreviewModal";
import { SlideThumbnail } from "./SlideThumbnail";
import { SlideLayoutModal } from "./SlideLayoutModal";
import { useSlideThumbnails } from "./useSlideThumbnails";
import { exportSlidesToPDF } from "./exporters/exportToPDF";
import { exportSlidesToPPTX } from "./exporters/exportToPPTX";
import { SharePresentationModal } from "./SharePresentationModal";

export type FrameSlide = {
  id: string;
  name?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  order?: number | null;
  /** Increments when elements inside this frame change; drives thumbnail cache invalidation */
  contentVersion?: number;
  /** Full render signature including padlet overlay inputs */
  renderSignature?: string;
};

export type ViewportSize = { width: number; height: number };

export type RenderSlideOptions = {
  scale?: number;
  paddingPx?: number;
  background?: string;
};

export type RenderSlideToPNG = (slide: FrameSlide, opts: RenderSlideOptions) => Promise<string>;

type Props = {
  slides: FrameSlide[];
  activeSlideId?: string | null;
  onActivateSlide?: (slideId: string) => void;
  onClose?: () => void;
  renderSlideToPNG: RenderSlideToPNG;
  thumbnail: { width: number; height: number };
  accentClassName?: string;

  // Slide management
  onAddSlide?: () => void;
  onAddSlideBelow?: (id: string) => void;
  onDuplicateSlide?: (id: string) => void;
  onRemoveSlide?: (id: string) => void;
  onRenameSlide?: (id: string, name: string) => void;
  onArrangeLayout?: (type: "row" | "column" | "grid", columns?: number) => void;
  onStartPresentation?: (fromSlideId?: string) => void;
};

export function PresentationPanel({
  slides,
  activeSlideId,
  onActivateSlide,
  onClose,
  renderSlideToPNG,
  thumbnail,
  accentClassName = "text-violet-600",
  onAddSlide,
  onAddSlideBelow,
  onDuplicateSlide,
  onRemoveSlide,
  onRenameSlide,
  onArrangeLayout,
  onStartPresentation,
}: Props) {
  const sortedSlides = useMemo(() => {
    const s = [...slides];
    s.sort((a, b) => {
      const ao = a.order ?? Number.POSITIVE_INFINITY;
      const bo = b.order ?? Number.POSITIVE_INFINITY;
      if (ao !== bo) return ao - bo;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
    return s;
  }, [slides]);

  // Selection
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedCount = useMemo(
    () => sortedSlides.filter((s) => selected[s.id]).length,
    [sortedSlides, selected]
  );
  useEffect(() => {
    if (sortedSlides.length === 0) return;
    const hasAny = Object.values(selected).some(Boolean);
    if (!hasAny) {
      const all: Record<string, boolean> = {};
      for (const s of sortedSlides) all[s.id] = true;
      setSelected(all);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedSlides.length]);

  const toggleOne = (id: string) => setSelected((p) => ({ ...p, [id]: !p[id] }));
  const toggleAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    for (const s of sortedSlides) next[s.id] = v;
    setSelected(next);
  };

  // Inline rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = (slide: FrameSlide) => {
    setRenamingId(slide.id);
    setRenameValue(slide.name?.trim() ?? "");
    setTimeout(() => renameInputRef.current?.select(), 30);
  };
  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameSlide?.(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  // Per-slide ⋮ menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const slideMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openMenuId) return;
    const handle = (e: MouseEvent) => {
      if (slideMenuRef.current && !slideMenuRef.current.contains(e.target as Node))
        setOpenMenuId(null);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [openMenuId]);

  // Global header ⋮ menu
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const [exportBusy, setExportBusy] = useState<null | "pdf" | "pptx">(null);
  useEffect(() => {
    if (!headerMenuOpen) return;
    const handle = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node))
        setHeaderMenuOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [headerMenuOpen]);

  const doExportAll = async (format: "pdf" | "pptx") => {
    setExportBusy(format);
    setHeaderMenuOpen(false);
    try {
      if (format === "pdf") {
        await exportSlidesToPDF({ slides: sortedSlides, renderSlideToPNG, fileName: "presentation.pdf" });
      } else {
        await exportSlidesToPPTX({ slides: sortedSlides, renderSlideToPNG, fileName: "presentation.pptx" });
      }
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExportBusy(null);
    }
  };

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSlideId, setPreviewSlideId] = useState<string | null>(null);

  // Layout modal
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);

  // Share presentation modal
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Thumbnails
  const { thumbs, isGeneratingAny } = useSlideThumbnails({
    slides: sortedSlides,
    renderSlideToPNG,
    height: thumbnail.height,
    background: "#ffffff",
    dpr: 2,
  });

  // Thumbnails are self-triggered inside useSlideThumbnails via slideSignature

  const slideCountLabel =
    selectedCount === 0 || selectedCount === sortedSlides.length
      ? `Slides (${sortedSlides.length})`
      : `Slides (${selectedCount} selected out of ${sortedSlides.length})`;

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className={`text-base font-semibold ${accentClassName}`}>Presentation</span>

          <div className="flex items-center gap-1">
            {/* ⊞ Layout */}
            <button
              type="button"
              onClick={() => setLayoutModalOpen(true)}
              title="Arrange slide layout"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>

            {/* + Add slide */}
            <button
              type="button"
              onClick={onAddSlide}
              title="Add slide"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </button>

            {/* ⋮ Global menu */}
            <div className="relative" ref={headerMenuRef}>
              <button
                type="button"
                onClick={() => setHeaderMenuOpen((v) => !v)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                title="More options"
                disabled={!!exportBusy}
              >
                {exportBusy ? (
                  <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="19" r="1.5" />
                  </svg>
                )}
              </button>

              {headerMenuOpen && (
                <div className="absolute right-0 mt-1 w-52 rounded-xl border border-gray-200 bg-white shadow-lg z-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setShareModalOpen(true); setHeaderMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Share slides
                  </button>
                  <button
                    type="button"
                    onClick={() => doExportAll("pdf")}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                    Slides as PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => doExportAll("pptx")}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" strokeLinecap="round" />
                    </svg>
                    Slides as PPTX
                  </button>
                </div>
              )}
            </div>

            {/* X Close */}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Slide count + All/None */}
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span className="font-medium text-gray-800">{slideCountLabel}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => toggleAll(true)} className="text-xs px-2 py-1 rounded-md hover:bg-gray-100">All</button>
            <button type="button" onClick={() => toggleAll(false)} className="text-xs px-2 py-1 rounded-md hover:bg-gray-100">None</button>
          </div>
        </div>

        {isGeneratingAny && (
          <div className="mt-1.5 text-xs text-gray-400">Generating previews…</div>
        )}
      </div>

      {/* ── Slide list ── */}
      <div className="flex-1 overflow-auto px-3 py-3">
        {sortedSlides.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-12 px-4">
            No slides yet. Draw a Frame in Excalidraw to create a slide.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedSlides.map((slide, idx) => {
              const isActive = activeSlideId === slide.id;
              const title = slide.name?.trim() || `Slide ${idx + 1}`;
              const thumb = thumbs[slide.id] ?? null;
              const isRenaming = renamingId === slide.id;
              const menuIsOpen = openMenuId === slide.id;

              return (
                <div key={slide.id} className="group flex items-start gap-2">
                  {/* Checkbox */}
                  <div className="pt-2.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={!!selected[slide.id]}
                      onChange={() => toggleOne(slide.id)}
                      className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                    />
                  </div>

                  {/* Card */}
                  <div
                    className={[
                      "flex-1 min-w-0 rounded-xl border transition-all overflow-hidden",
                      isActive
                        ? "border-violet-400 ring-2 ring-violet-100"
                        : "border-gray-200 hover:border-gray-300",
                    ].join(" ")}
                  >
                    {/* Thumbnail — click to activate */}
                    <button
                      type="button"
                      className="block w-full text-left p-2 focus:outline-none"
                      onClick={() => onActivateSlide?.(slide.id)}
                    >
                      <SlideThumbnail
                        pngDataUrl={thumb}
                        width={thumbnail.width}
                        height={thumbnail.height}
                        isActive={isActive}
                      />
                    </button>

                    {/* Footer bar */}
                    <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-2">
                      {/* Name / rename input */}
                      {isRenaming ? (
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="flex-1 min-w-0 text-sm font-medium text-gray-800 bg-white border border-violet-300 rounded-md px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-400"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1 min-w-0 text-sm font-medium text-gray-700 truncate">
                          {title}
                        </span>
                      )}

                      {/* Per-slide ⋮ menu */}
                      <div className="relative flex-shrink-0" ref={menuIsOpen ? slideMenuRef : undefined}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(menuIsOpen ? null : slide.id);
                          }}
                          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="12" cy="19" r="1.5" />
                          </svg>
                        </button>

                        {menuIsOpen && (
                          <div
                            ref={slideMenuRef}
                            className="absolute right-0 bottom-full mb-1 w-52 rounded-xl border border-gray-200 bg-white shadow-lg z-50 overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => { onStartPresentation?.(slide.id); setOpenMenuId(null); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                              Start presentation
                            </button>
                            <button
                              type="button"
                              onClick={() => { setShareModalOpen(true); setOpenMenuId(null); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                              </svg>
                              Share presentation
                            </button>

                            <div className="border-t border-gray-100 my-0.5" />

                            <button
                              type="button"
                              onClick={() => { setPreviewSlideId(slide.id); setPreviewOpen(true); setOpenMenuId(null); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" strokeLinecap="round" />
                              </svg>
                              Preview slide
                            </button>

                            <div className="border-t border-gray-100 my-0.5" />

                            <button
                              type="button"
                              onClick={() => { onDuplicateSlide?.(slide.id); setOpenMenuId(null); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                              </svg>
                              Duplicate slide
                            </button>
                            <button
                              type="button"
                              onClick={() => { startRename(slide); setOpenMenuId(null); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                              Rename slide
                            </button>
                            <button
                              type="button"
                              onClick={() => { onAddSlideBelow?.(slide.id); setOpenMenuId(null); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                              </svg>
                              Add slide below
                            </button>

                            <div className="border-t border-gray-100 my-0.5" />

                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Remove "${title}"?`)) {
                                  onRemoveSlide?.(slide.id);
                                }
                                setOpenMenuId(null);
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" strokeLinecap="round" />
                              </svg>
                              Remove slide
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom: Start presentation ── */}
      <div className="flex-shrink-0 px-3 pb-4 pt-2 border-t border-gray-100">
        <button
          type="button"
          disabled={sortedSlides.length === 0}
          onClick={() => onStartPresentation?.()}
          className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Start presentation
        </button>
      </div>

      {/* ── Modals ── */}
      <SlideLayoutModal
        open={layoutModalOpen}
        onClose={() => setLayoutModalOpen(false)}
        onApply={(type, cols) => {
          onArrangeLayout?.(type, cols);
          setLayoutModalOpen(false);
        }}
      />

      <PresentationPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        slides={sortedSlides}
        activeSlideId={previewSlideId}
        renderSlideToPNG={renderSlideToPNG}
      />

      <SharePresentationModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        slides={sortedSlides}
        activeSlideId={activeSlideId || null}
        renderSlideToPNG={renderSlideToPNG}
      />
    </div>
  );
}
