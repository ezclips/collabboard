'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Folder, FileText, Image as ImageIcon, Check } from 'lucide-react';
import type { ImportBrowserItem } from '@/lib/imports/types';

interface ImportGridProps {
  items: ImportBrowserItem[];
  selectedId: string | null;
  onSelect: (item: ImportBrowserItem) => void;
  onNavigate: (item: ImportBrowserItem) => void;
  accessToken?: string | null;
}

function FileIcon({ item }: { item: ImportBrowserItem }) {
  if (item.isFolder) return <Folder className="w-8 h-8 text-blue-400" />;

  if (item.mimeType.startsWith('image/')) {
    return <ImageIcon className="w-8 h-8 text-green-500" />;
  }

  return <FileText className="w-8 h-8 text-gray-400" />;
}

function ItemThumbnail({ item, accessToken }: { item: ImportBrowserItem; accessToken?: string | null }) {
  const [imgError, setImgError] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestBlobUrlRef = useRef<string | null>(null);

  // Only start loading once the tile scrolls near the viewport (2 rows lookahead ~= 300px)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Google Drive thumbnails need an Authorization header — fetch and convert to blob URL.
    if (!visible || item.provider !== 'google-drive' || !item.thumbnailUrl || !accessToken) return;
    let cancelled = false;
    fetch(item.thumbnailUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? res.blob() : Promise.reject()))
      .then((blob) => {
        if (cancelled) return;
        const nextBlobUrl = URL.createObjectURL(blob);
        const previousBlobUrl = latestBlobUrlRef.current;
        latestBlobUrlRef.current = nextBlobUrl;
        setBlobUrl(nextBlobUrl);
        if (previousBlobUrl) {
          URL.revokeObjectURL(previousBlobUrl);
        }
      })
      .catch(() => { if (!cancelled) setImgError(true); });
    return () => {
      cancelled = true;
    };
  }, [visible, item.provider, item.thumbnailUrl, accessToken]);

  useEffect(() => {
    return () => {
      if (latestBlobUrlRef.current) {
        URL.revokeObjectURL(latestBlobUrlRef.current);
      }
    };
  }, []);

  const src = item.provider === 'google-drive' ? blobUrl : item.thumbnailUrl;

  return (
    <div ref={containerRef} className="w-full h-full">
      {src && !imgError ? (
        <img
          src={src}
          alt={item.name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-50">
          <FileIcon item={item} />
        </div>
      )}
    </div>
  );
}

export default function ImportGrid({ items, selectedId, onSelect, onNavigate, accessToken }: ImportGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-400">
        <FileText className="w-10 h-10 mb-2 opacity-30" />
        <p className="text-sm">No files found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => {
        const isSelected = selectedId === item.id;
        return (
          <div
            key={item.id}
            onClick={() => {
              if (item.isFolder) {
                onNavigate(item);
              } else {
                onSelect(item);
              }
            }}
            className={`relative rounded-lg border-2 cursor-pointer overflow-hidden transition-all group
              ${isSelected
                ? 'border-blue-500 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
              }`}
          >
            {/* Thumbnail area */}
            <div className="aspect-square overflow-hidden bg-gray-100">
              <ItemThumbnail item={item} accessToken={accessToken} />
            </div>

            {/* Selected check */}
            {isSelected && (
              <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}

            {/* Label */}
            <div className="p-2 bg-white border-t border-gray-100">
              <p className="text-xs text-gray-700 font-medium truncate leading-tight">{item.name}</p>
              {item.sizeBytes && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {(item.sizeBytes / 1024).toFixed(0)} KB
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
