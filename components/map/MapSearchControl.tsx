"use client";

import React from 'react';
import dynamic from 'next/dynamic';

type SearchBoxProps = {
  accessToken: string;
  options?: {
    language?: string;
    limit?: number;
    types?: string;
  };
  placeholder?: string;
  onRetrieve?: (response: SearchRetrieveResponse) => void;
};

type SearchRetrieveResponse = {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: { full_address?: string; name?: string };
  }>;
};

const SearchBox = dynamic(
  () => import('@mapbox/search-js-react').then((m) => m.SearchBox as React.ComponentType<SearchBoxProps>),
  { ssr: false }
);

type MapSearchControlProps = {
  accessToken: string;
  onSelectLocation: (location: { lng: number; lat: number; label?: string }) => void;
  onDropPin: () => void;
  onCancel?: () => void;
  isDropPinActive?: boolean;
  onSearchFocus?: () => void;
};

export default function MapSearchControl({
  accessToken,
  onSelectLocation,
  onDropPin,
  onCancel,
  isDropPinActive = false,
  onSearchFocus,
}: MapSearchControlProps) {
  return (
    <div className="absolute left-1/2 top-3 z-40 w-[min(640px,calc(100%-24px))] -translate-x-1/2 rounded-xl border border-slate-300 bg-slate-100/95 p-1 shadow">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${
            isDropPinActive ? 'bg-amber-500 text-white' : 'bg-slate-900 text-slate-100 hover:bg-slate-800'
          }`}
          onClick={onDropPin}
        >
          Drop Pin
        </button>
        {isDropPinActive && onCancel ? (
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
        <div
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white p-1"
          onFocusCapture={() => {
            onSearchFocus?.();
          }}
        >
          <SearchBox
            accessToken={accessToken}
            options={{
              language: 'en',
              limit: 8,
              types: 'address,poi,place,region',
            }}
            placeholder="Search place or address"
            onRetrieve={(response: SearchRetrieveResponse) => {
              const feature = response?.features?.[0];
              const center = feature?.geometry?.coordinates;
              if (!Array.isArray(center) || center.length < 2) return;
              onSelectLocation({
                lng: Number(center[0]),
                lat: Number(center[1]),
                label: feature?.properties?.full_address || feature?.properties?.name,
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}
