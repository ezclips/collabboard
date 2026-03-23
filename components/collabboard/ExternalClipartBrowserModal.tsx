'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Check, Loader2, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ExternalClipartItem = {
    id: string;
    title: string;
    svgUrl: string;
    source: 'iconify' | 'openclipart' | 'pdv';
    createdAt: number;
};

type Provider = 'iconify' | 'openclipart' | 'pdv';

// ============ ICONIFY ============
type IconifyResponse = {
    icons?: Array<{
        id: string;
        name: string;
        prefix: string;
        fullName: string;
        svgUrl: string;
    }>;
    total?: number;
    error?: string;
};

async function searchIconifyViaProxy(query: string, limit = 48) {
    const url = `/api/iconify/search?query=${encodeURIComponent(query.trim())}&limit=${limit}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`Iconify proxy failed: ${res.status}`);

    const json = (await res.json()) as IconifyResponse;

    if (json.error) {
        return { items: [] as ExternalClipartItem[], error: json.error };
    }

    const items: ExternalClipartItem[] = (json.icons || []).map((icon) => ({
        id: icon.id || icon.fullName,
        title: icon.name || icon.fullName,
        svgUrl: icon.svgUrl,
        source: 'iconify' as const,
        createdAt: Date.now(),
    }));

    return { items, error: null };
}

// ============ OPENCLIPART ============
type OpenClipartResponse = {
    payload?: Array<{
        id?: number | string;
        title?: string;
        svg?: string;
        svg_url?: string;
    }>;
    error?: string;
    upstreamStatus?: number;
    upstreamContentType?: string;
};

function normalizeOpenClipartItem(raw: any): ExternalClipartItem | null {
    const id = raw?.id ?? raw?.svg ?? raw?.svg_url;
    const svgUrl = raw?.svg ?? raw?.svg_url;

    if (!id || !svgUrl) return null;

    return {
        id: String(id),
        title: String(raw?.title || 'Untitled clipart'),
        svgUrl: String(svgUrl),
        source: 'openclipart',
        createdAt: Date.now(),
    };
}

async function searchOpenClipartViaProxy(query: string, page: number, amount = 48) {
    const url = `/api/openclipart/search?query=${encodeURIComponent(query.trim())}&page=${page}&amount=${amount}`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`OpenClipart proxy failed: ${res.status}`);

    const json = (await res.json()) as OpenClipartResponse;

    if (json.error) {
        const errorMsg =
            json.error === 'OpenClipart returned non-JSON'
                ? 'OpenClipart is temporarily blocked (rate limit). Try Iconify instead!'
                : json.error;
        return { items: [] as ExternalClipartItem[], error: errorMsg, upstreamInfo: json };
    }

    const items = (json.payload || [])
        .map(normalizeOpenClipartItem)
        .filter(Boolean) as ExternalClipartItem[];

    return { items, error: null, upstreamInfo: null };
}

// ============ MODAL ============
export default function ExternalClipartBrowserModal({
    isOpen,
    onClose,
    onAddSelected,
}: {
    isOpen: boolean;
    onClose: () => void;
    onAddSelected: (items: ExternalClipartItem[]) => void;
}) {
    const [provider, setProvider] = useState<Provider>('iconify');
    const [query, setQuery] = useState('arrow');
    const [page, setPage] = useState(1); // Only used for OpenClipart
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<ExternalClipartItem[]>([]);
    const [error, setError] = useState<string | null>(null);

    // OpenClipart Beta - specific state
    const [ocUrl, setOcUrl] = useState('');
    const [ocImporting, setOcImporting] = useState(false);
    const [ocError, setOcError] = useState<string | null>(null);

    // PDV (PublicDomainVectors) - specific state
    const [pdvUrl, setPdvUrl] = useState('');
    const [pdvImporting, setPdvImporting] = useState(false);
    const [pdvError, setPdvError] = useState<string | null>(null);
    const [pdvResolved, setPdvResolved] = useState(false);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const selectedCount = selectedIds.size;

    const selectedItems = useMemo(() => {
        const s = new Set(selectedIds);
        return items.filter((it) => s.has(it.id));
    }, [items, selectedIds]);

    // Search effect - for Iconify and FreeSVG (grid-based providers)
    useEffect(() => {
        if (!isOpen) return;
        if (provider === 'openclipart' || provider === 'pdv') {
            // URL import providers, not search grid
            setItems([]);
            setError(null);
            setLoading(false);
            return;
        }

        let cancelled = false;

        const run = async () => {
            setLoading(true);
            setError(null);

            try {
                let results: ExternalClipartItem[] = [];
                let err: string | null = null;

                if (provider === 'iconify') {
                    const { items: iconifyItems, error: iconifyErr } = await searchIconifyViaProxy(query, 60);
                    results = iconifyItems;
                    err = iconifyErr;
                }

                if (cancelled) return;
                setItems(results);
                if (err) setError(err);
            } catch (e: any) {
                if (cancelled) return;
                setItems([]);
                setError(e?.message || 'Search failed');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [isOpen, query, provider, page]);

    // Reset selection on open
    useEffect(() => {
        if (!isOpen) return;
        setSelectedIds(new Set());
    }, [isOpen]);

    // Reset page when switching providers
    useEffect(() => {
        setPage(1);
        setSelectedIds(new Set());
        setOcError(null);
    }, [provider]);

    // OpenClipart no longer auto-resolves - user must paste direct SVG URL

    // Helpers for OpenClipart - direct URL import only
    const importOpenClipartUrl = async (url: string) => {
        const cleaned = url.trim();
        if (!cleaned) return;

        // Validate it looks like a direct SVG URL
        if (!cleaned.toLowerCase().endsWith('.svg') && !cleaned.includes('/download/')) {
            setOcError('Please paste a direct SVG URL (ending in .svg or containing /download/)');
            return;
        }

        setOcImporting(true);
        setOcError(null);

        try {
            const normalized = !cleaned.startsWith('http') ? `https://${cleaned}` : cleaned;

            const item: ExternalClipartItem = {
                id: `openclipart:${normalized}`,
                title: 'OpenClipart',
                svgUrl: normalized,
                source: 'openclipart',
                createdAt: Date.now(),
            };

            onAddSelected([item]);
            setOcUrl('');
        } catch (e: any) {
            setOcError(e?.message || 'Import failed');
        } finally {
            setOcImporting(false);
        }
    };

    const importFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                setOcUrl(text);
                await importOpenClipartUrl(text);
            }
        } catch {
            setOcError("Clipboard access blocked. Paste the URL manually.");
        }
    };

    // ============ PDV (PublicDomainVectors) Helpers ============
    const importPdvUrl = async (url: string) => {
        const cleaned = url.trim();
        if (!cleaned) return;

        setPdvImporting(true);
        setPdvError(null);

        try {
            const normalized = !cleaned.startsWith('http') ? `https://${cleaned}` : cleaned;
            const res = await fetch(`/api/pdv/resolve?url=${encodeURIComponent(normalized)}`);
            const json = await res.json();

            if (!res.ok || json?.error) {
                setPdvError(json?.message || json?.error || 'Resolve failed');
                return;
            }

            const item: ExternalClipartItem = {
                id: `pdv:${json.pageUrl}`,
                title: json.title || 'PublicDomainVectors',
                svgUrl: json.svgUrl,
                source: 'pdv',
                createdAt: Date.now(),
            };

            // Auto-fill the resolved URL so user sees the direct .svg link
            setPdvUrl(json.svgUrl);
            setPdvResolved(true);
            onAddSelected([item]);
        } catch (e: any) {
            setPdvError(e?.message || 'Import failed');
        } finally {
            setPdvImporting(false);
        }
    };

    const pastePdvFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                setPdvUrl(text);
                setPdvResolved(false);
                await importPdvUrl(text);
            }
        } catch {
            setPdvError("Clipboard access blocked. Paste the URL manually.");
        }
    };

    // PDV auto-resolve effect
    useEffect(() => {
        if (provider !== 'pdv') return;

        const v = pdvUrl.trim();
        if (!v) {
            setPdvResolved(false);
            return;
        }

        // Skip if already resolved (.svg URL)
        if (v.toLowerCase().endsWith('.svg')) {
            setPdvResolved(true);
            return;
        }

        // Only auto-resolve if it looks like a PDV page URL
        if (!v.includes('publicdomainvectors.org')) return;

        const t = setTimeout(async () => {
            setPdvImporting(true);
            setPdvError(null);

            try {
                const normalized = v.startsWith('http') ? v : `https://${v}`;
                const res = await fetch(`/api/pdv/resolve?url=${encodeURIComponent(normalized)}`);
                const json = await res.json();

                if (!res.ok || json?.error) {
                    setPdvError(json?.message || json?.error || 'Resolve failed');
                    return;
                }

                if (json?.svgUrl) {
                    setPdvUrl(json.svgUrl);
                    setPdvResolved(true);
                }
            } catch (e: any) {
                setPdvError(e?.message || 'Resolve failed');
            } finally {
                setPdvImporting(false);
            }
        }, 600);

        return () => clearTimeout(t);
    }, [pdvUrl, provider]);

    // Reset PDV state when switching providers
    useEffect(() => {
        setPdvUrl('');
        setPdvError(null);
        setPdvResolved(false);
    }, [provider]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80000]">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />

            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-5xl h-[85vh] bg-white rounded-2xl shadow-2xl border overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="px-5 py-4 border-b flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="text-sm font-semibold text-gray-900">Add icons from web</div>
                        </div>

                        <Button variant="ghost" size="icon" onClick={onClose} className="h-9 w-9">
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Provider tabs */}
                    <div className="px-5 py-2 border-b bg-gray-50 flex items-center gap-2">
                        <button
                            onClick={() => setProvider('iconify')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${provider === 'iconify'
                                ? 'bg-white shadow-sm text-blue-600 border border-gray-200'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                🎨 Iconify
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">Stable</span>
                            </span>
                        </button>
                        <button
                            onClick={() => setProvider('openclipart')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${provider === 'openclipart'
                                ? 'bg-white shadow-sm text-blue-600 border border-gray-200'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                🖼️ OpenClipart
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Beta</span>
                            </span>
                        </button>
                        <button
                            onClick={() => setProvider('pdv')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${provider === 'pdv'
                                ? 'bg-white shadow-sm text-blue-600 border border-gray-200'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                🌐 PublicDomainVectors
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">Stable</span>
                            </span>
                        </button>
                    </div>

                    {/* Search row - for Iconify */}
                    {provider === 'iconify' && (
                        <div className="px-5 py-3 border-b flex items-center gap-3">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    value={query}
                                    onChange={(e) => {
                                        setQuery(e.target.value);
                                        setPage(1);
                                    }}
                                    placeholder="Search icons… (e.g. arrow, user, settings, home)"
                                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-blue-200"
                                />
                            </div>
                        </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        {provider === 'openclipart' ? (
                            <div className="flex flex-col h-full">
                                {/* OpenClipart Import bar */}
                                <div className="px-5 py-3 border-b flex items-center gap-2">
                                    <input
                                        value={ocUrl}
                                        onChange={(e) => setOcUrl(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') importOpenClipartUrl(ocUrl);
                                        }}
                                        placeholder="Paste direct SVG URL (e.g. https://openclipart.org/download/12345/file.svg)"
                                        className="flex-1 px-3 py-2 text-sm rounded-xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-blue-200"
                                    />
                                    <Button
                                        size="sm"
                                        onClick={() => importOpenClipartUrl(ocUrl)}
                                        disabled={ocImporting || !ocUrl.trim()}
                                        className="rounded-xl px-4"
                                    >
                                        {ocImporting ? 'Importing…' : 'Import'}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={importFromClipboard}
                                        className="rounded-xl border-gray-200 bg-white"
                                    >
                                        Paste from clipboard
                                    </Button>
                                    <a
                                        href="https://openclipart.org/"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="px-3 py-2 rounded-xl border bg-white text-sm hover:bg-gray-50"
                                        title="Open OpenClipart in a new tab"
                                    >
                                        <ArrowUpRight className="w-4 h-4" />
                                    </a>
                                </div>
                                {/* Status */}
                                <div className="px-5 py-3 text-sm border-b bg-gray-50/50">
                                    {ocError ? (
                                        <div className="text-red-600 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" />
                                            {ocError}
                                        </div>
                                    ) : ocImporting ? (
                                        <div className="text-blue-600 flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Importing…
                                        </div>
                                    ) : (
                                        <div className="text-gray-500">
                                            Paste a direct SVG URL (ending in <code className="bg-gray-100 px-1 rounded">.svg</code>), then click Import.
                                        </div>
                                    )}
                                </div>
                                {/* Instructions */}
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-400">
                                    <div className="text-6xl mb-4">🖼️</div>
                                    <div className="text-lg font-medium text-gray-600 mb-2">Import from OpenClipart</div>
                                    <div className="max-w-md text-sm">
                                        Browse <a href="https://openclipart.org/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">openclipart.org</a> in a new tab,
                                        right-click &quot;Download SVG&quot; → Copy link address, then paste here.
                                    </div>
                                </div>
                            </div>
                        ) : provider === 'pdv' ? (
                            <div className="flex flex-col h-full">
                                {/* PDV Import bar */}
                                <div className="px-5 py-3 border-b flex items-center gap-2">
                                    <input
                                        value={pdvUrl}
                                        onChange={(e) => {
                                            setPdvUrl(e.target.value);
                                            setPdvResolved(false);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') importPdvUrl(pdvUrl);
                                        }}
                                        placeholder="Paste a PDV page URL or direct SVG link"
                                        className="flex-1 px-3 py-2 text-sm rounded-xl bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-blue-200"
                                    />
                                    <Button
                                        size="sm"
                                        onClick={() => importPdvUrl(pdvUrl)}
                                        disabled={pdvImporting || !pdvUrl.trim()}
                                        className="rounded-xl px-4"
                                    >
                                        {pdvImporting ? 'Resolving…' : 'Import'}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={pastePdvFromClipboard}
                                        className="rounded-xl border-gray-200 bg-white"
                                    >
                                        Paste from clipboard
                                    </Button>
                                    <a
                                        href="https://publicdomainvectors.org/"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="px-3 py-2 rounded-xl border bg-white text-sm hover:bg-gray-50"
                                        title="Open PublicDomainVectors in a new tab"
                                    >
                                        <ArrowUpRight className="w-4 h-4" />
                                    </a>
                                </div>
                                {/* Status */}
                                <div className="px-5 py-3 text-sm border-b bg-gray-50/50">
                                    {pdvError ? (
                                        <div className="text-red-600 flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4" />
                                            {pdvError}
                                        </div>
                                    ) : pdvImporting ? (
                                        <div className="text-blue-600 flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Resolving SVG link…
                                        </div>
                                    ) : pdvResolved ? (
                                        <div className="text-green-600 flex items-center gap-2">
                                            <Check className="w-4 h-4" />
                                            Resolved ✓ — Click Import to save to your library.
                                        </div>
                                    ) : (
                                        <div className="text-gray-500">
                                            Browse PDV, copy the page URL, then click &quot;Paste from clipboard&quot;. We auto-resolve the direct SVG link.
                                        </div>
                                    )}
                                </div>
                                {/* Instructions */}
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-gray-400">
                                    <div className="text-6xl mb-4">🌐</div>
                                    <div className="text-lg font-medium text-gray-600 mb-2">Import from PublicDomainVectors</div>
                                    <div className="max-w-md text-sm">
                                        Browse <a href="https://publicdomainvectors.org/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">publicdomainvectors.org</a> in a new tab,
                                        copy the page URL, then paste here. We&apos;ll auto-resolve the direct SVG download link!
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* Iconify Grid */
                            <div className="h-full overflow-y-auto p-5">
                                {loading ? (
                                    <div className="h-full flex items-center justify-center text-gray-500">
                                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                        Loading icons…
                                    </div>
                                ) : error ? (
                                    <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-red-700">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle className="w-5 h-5 mt-0.5" />
                                            <div className="flex-1">
                                                <div className="font-semibold">Couldn&apos;t load icons</div>
                                                <div className="text-sm mt-1">{error}</div>
                                            </div>
                                        </div>
                                    </div>
                                ) : items.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-gray-500">
                                        No results. Try another search.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                                        {items.map((it) => {
                                            const isSelected = selectedIds.has(it.id);
                                            return (
                                                <button
                                                    key={it.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedIds((prev) => {
                                                            const next = new Set(prev);
                                                            if (next.has(it.id)) next.delete(it.id);
                                                            else next.add(it.id);
                                                            return next;
                                                        });
                                                    }}
                                                    className={`relative group rounded-xl border overflow-hidden bg-white hover:shadow-sm transition-all text-left ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                                                        }`}
                                                >
                                                    <div
                                                        className={`absolute top-2 right-2 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected
                                                            ? 'bg-blue-600 border-blue-600 text-white'
                                                            : 'bg-white/90 border-gray-300 text-transparent group-hover:text-gray-300'
                                                            }`}
                                                    >
                                                        <Check className="w-3 h-3" />
                                                    </div>

                                                    <div className="h-20 w-full flex items-center justify-center bg-gray-50 p-2">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={it.svgUrl}
                                                            alt={it.title}
                                                            className="h-12 w-12 object-contain"
                                                            draggable={false}
                                                            loading="lazy"
                                                        />
                                                    </div>

                                                    <div className="p-2">
                                                        <div className="text-[11px] font-medium text-gray-700 line-clamp-1">{it.title}</div>
                                                        <div className="text-[10px] text-gray-400">Iconify</div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-4 border-t flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                            {provider === 'iconify' ? (
                                <>Selected: <span className="font-semibold">{selectedCount}</span></>
                            ) : (
                                <span className="text-gray-400">OpenClipart imports directly via the bar above.</span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="outline" className="rounded-xl" onClick={onClose}>
                                {provider === 'openclipart' ? 'Close' : 'Cancel'}
                            </Button>

                            {provider === 'iconify' && (
                                <Button
                                    className="rounded-xl bg-blue-600 hover:bg-blue-700"
                                    disabled={selectedCount === 0}
                                    onClick={() => {
                                        onAddSelected(selectedItems);
                                        onClose();
                                    }}
                                >
                                    Add selected
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
