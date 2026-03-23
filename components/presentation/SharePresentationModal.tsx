"use client";

import React, { useEffect, useState } from "react";
import { FrameSlide, RenderSlideToPNG } from "./PresentationPanel";
import { SlideThumbnail } from "./SlideThumbnail";
import { X, Copy, Plus, RefreshCw, Info, Check } from "lucide-react";

type TabContext = "share-scene" | "embed-link" | "share-presentation";

export function SharePresentationModal({
    open,
    onClose,
    slides,
    activeSlideId,
    renderSlideToPNG,
}: {
    open: boolean;
    onClose: () => void;
    slides: FrameSlide[];
    activeSlideId: string | null;
    renderSlideToPNG: RenderSlideToPNG;
}) {
    const [activeTab, setActiveTab] = useState<TabContext>("share-presentation");
    const [shareSceneEnabled, setShareSceneEnabled] = useState(false);
    const [sharePresentationEnabled, setSharePresentationEnabled] = useState(true);

    // Presentation Options
    const [showSlideTitle, setShowSlideTitle] = useState(false);
    const [allowDownload, setAllowDownload] = useState(true);
    const [animateSlides, setAnimateSlides] = useState(true);
    const [autoPlaySlides, setAutoPlaySlides] = useState(false);
    const [startingSlide, setStartingSlide] = useState("Beginning");

    const [presentationLinkTab, setPresentationLinkTab] = useState<"read-only" | "embed-iframe">("read-only");

    const [copied, setCopied] = useState(false);

    // Generating a preview image
    const [previewPng, setPreviewPng] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const currentIdx = activeSlideId ? slides.findIndex((s) => s.id === activeSlideId) : 0;
    const targetSlide = slides[Math.max(0, currentIdx)];

    const generatePreview = async () => {
        if (!targetSlide) return;
        setIsRefreshing(true);
        try {
            const scale = targetSlide.height > 0 ? 300 / targetSlide.height : 1;
            const png = await renderSlideToPNG(targetSlide, {
                scale: scale * 2,
                background: "#ffffff",
                paddingPx: 20,
            });
            setPreviewPng(png);
        } catch (e) {
            console.error("Preview render failed", e);
        } finally {
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        if (open && activeTab === "share-presentation") {
            generatePreview();
        }
    }, [open, activeTab, targetSlide?.id]);

    const copyToClipboard = () => {
        navigator.clipboard.writeText("https://link.excalidraw.com/p/readonly/zgmimyKmvq4E...");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!open) return null;

    // Custom Toggle Component to mimic Excalidraw's styling
    const Toggle = ({
        checked,
        onChange,
        disabled = false
    }: {
        checked: boolean;
        onChange: (b: boolean) => void;
        disabled?: boolean;
    }) => (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-violet-500" : "bg-white border border-gray-300"
                } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            style={!checked ? { width: "42px", height: "22px" } : undefined}
        >
            <span
                className={`inline-block h-5 w-5 transform rounded-full transition-transform ${checked ? "translate-x-5 bg-white shadow-sm" : "translate-x-px bg-gray-900"
                    }`}
            />
        </button>
    );

    return (
        <div className="fixed inset-0 z-[800] flex items-center justify-center pointer-events-auto">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />

            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header / Tabs */}
                <div className="flex-shrink-0 pt-3 px-6 pb-0 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button
                            type="button"
                            onClick={() => setActiveTab("share-scene")}
                            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "share-scene" ? "border-violet-500 text-violet-600" : "border-transparent text-gray-500 hover:text-gray-900"
                                }`}
                        >
                            Share scene
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab("embed-link")}
                            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "embed-link" ? "border-violet-500 text-violet-600" : "border-transparent text-gray-500 hover:text-gray-900"
                                }`}
                        >
                            Embed link
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab("share-presentation")}
                            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "share-presentation" ? "border-violet-500 text-violet-600" : "border-transparent text-gray-500 hover:text-gray-900"
                                }`}
                        >
                            Share presentation
                        </button>
                    </div>
                    <button
                        onClick={onClose}
                        className="pb-3 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X size={20} className="font-light" />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="p-6 overflow-auto">

                    {/* TAB 1: Share Scene */}
                    {activeTab === "share-scene" && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-700 text-sm font-medium">Shareable link collaboration  {shareSceneEnabled ? "Enabled" : "Disabled"}</span>
                                <Toggle checked={shareSceneEnabled} onChange={setShareSceneEnabled} />
                            </div>

                            {shareSceneEnabled ? (
                                <div className="mt-8 pt-4 border-t border-purple-100">
                                    <div className="mb-2 text-sm text-gray-700">Link</div>
                                    <div className="flex items-center gap-2 w-full p-2.5 bg-violet-50 rounded-xl text-sm border border-transparent">
                                        <span className="flex-1 text-gray-600 truncate">https://excalidraw.com/#room=mock...</span>
                                        <button onClick={copyToClipboard} className="text-gray-500 hover:text-gray-800 transition-colors p-1" title="Copy to clipboard">
                                            {copied ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-8">
                                    <div className="h-px bg-indigo-50 w-full mb-4"></div>
                                    <p className="text-sm text-gray-500 leading-relaxed">
                                        For read-only links for embedding and integrations without realtime collaboration, use <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab("embed-link"); }} className="text-violet-500 hover:underline cursor-pointer">embeddable links</a>.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: Embed Link */}
                    {activeTab === "embed-link" && (
                        <div className="flex flex-col h-64">
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                                <div className="flex items-center gap-2 mb-2 text-sm font-medium">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"></path>
                                        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"></path>
                                    </svg>
                                    Create first link
                                </div>
                            </div>
                            <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
                                <button className="flex items-center gap-2 bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                                    <Plus size={16} />
                                    Create new link
                                </button>
                                <div className="text-sm text-gray-500">You have <strong>0</strong> links.</div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: Share Presentation */}
                    {activeTab === "share-presentation" && (
                        <div className="space-y-6">
                            {/* Top Toggle */}
                            <div className="flex items-center gap-3">
                                <span className="text-gray-800 text-sm font-medium">Share presentation slides</span>
                                <span className="text-gray-500 text-sm">{sharePresentationEnabled ? "Enabled" : "Disabled"}</span>
                                <div className="ml-1">
                                    <Toggle checked={sharePresentationEnabled} onChange={setSharePresentationEnabled} />
                                </div>
                            </div>

                            {/* Preview Box */}
                            <div className="relative w-full aspect-[4/3] rounded-xl border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shadow-sm">
                                {previewPng ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={previewPng} alt="Preview" className="w-full h-full object-contain p-4 mix-blend-multiply" />
                                ) : (
                                    <div className="w-16 h-16 border-2 border-gray-300 rounded-lg transform rotate-45 border-dashed pointer-events-none opacity-50" />
                                )}

                                <button
                                    onClick={generatePreview}
                                    disabled={isRefreshing}
                                    className="absolute top-3 right-3 p-1.5 text-gray-500 hover:bg-white hover:shadow-sm rounded-md transition-all disabled:opacity-50"
                                    title="Refresh preview"
                                >
                                    <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
                                </button>
                            </div>

                            {/* Choose options */}
                            <div>
                                <div className="text-sm text-gray-600 mb-3 font-medium">Choose options</div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex items-center gap-3">
                                        <Toggle checked={showSlideTitle} onChange={setShowSlideTitle} />
                                        <span className="text-sm text-gray-700">Show slide title</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Toggle checked={animateSlides} onChange={setAnimateSlides} />
                                        <span className="text-sm text-gray-700">Animate slides</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Toggle checked={allowDownload} onChange={setAllowDownload} />
                                        <span className="text-sm text-gray-700 flex items-center gap-1.5">
                                            Allow download <span title="Allows viewers to download presentation as PDF/PPTX"><Info size={14} className="text-gray-400 cursor-help" /></span>
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Toggle checked={autoPlaySlides} onChange={setAutoPlaySlides} />
                                        <span className="text-sm text-gray-700">Auto-play slides</span>
                                    </div>
                                </div>
                            </div>

                            {/* Starting slide */}
                            <div className="flex items-center justify-between py-2">
                                <div>
                                    <div className="text-sm font-medium text-gray-800">Starting slide</div>
                                    <div className="text-xs text-gray-400 mt-0.5">Choose which slide to start the presentation from</div>
                                </div>
                                <select
                                    className="text-sm border border-gray-200 rounded-lg py-1.5 px-3 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-100 focus:border-violet-300 cursor-pointer"
                                    value={startingSlide}
                                    onChange={(e) => setStartingSlide(e.target.value)}
                                >
                                    <option value="Beginning">From beginning</option>
                                    <option value="Current">Current slide</option>
                                    {slides.map((s, i) => (
                                        <option key={s.id} value={s.id}>Slide {i + 1} {s.name ? `- ${s.name.substring(0, 15)}` : ''}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Link area tabs & result */}
                            <div className="pt-2">
                                <div className="flex items-center gap-4 border-b border-gray-100 mb-4">
                                    <button
                                        type="button"
                                        onClick={() => setPresentationLinkTab("read-only")}
                                        className={`pb-2 text-sm font-medium transition-colors border-b-2 ${presentationLinkTab === "read-only" ? "border-violet-500 text-violet-600" : "border-transparent text-gray-500 hover:text-gray-900"
                                            }`}
                                    >
                                        Read-only link
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPresentationLinkTab("embed-iframe")}
                                        className={`pb-2 text-sm font-medium transition-colors border-b-2 ${presentationLinkTab === "embed-iframe" ? "border-violet-500 text-violet-600" : "border-transparent text-gray-500 hover:text-gray-900"
                                            }`}
                                    >
                                        Embed iframe
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <div className="text-sm font-medium text-gray-800">
                                        {presentationLinkTab === "read-only" ? "Link" : "Iframe Code"}
                                    </div>
                                    <div className="flex items-center gap-2 w-full p-2.5 bg-violet-50 rounded-xl text-sm border border-transparent">
                                        <span className="flex-1 text-gray-600 truncate font-mono text-xs">
                                            {presentationLinkTab === "read-only"
                                                ? "https://link.excalidraw.com/p/readonly/zgmimyKmvq4E..."
                                                : '<iframe src="https://link.excalidraw.com/p/readonly..." width="100%" height="100%"></iframe>'
                                            }
                                        </span>
                                        <button onClick={copyToClipboard} className="text-gray-500 hover:text-gray-800 transition-colors p-1" title="Copy to clipboard">
                                            {copied ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
