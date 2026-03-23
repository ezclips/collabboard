"use client";

import React from "react";
import { Check, Map as MapIcon, X } from "lucide-react";

export type MapStyleOption = {
  id: string;
  label: string;
  description: string;
};

const MAP_STYLES: MapStyleOption[] = [
  {
    id: "mapbox://styles/mapbox/streets-v11",
    label: "Streets",
    description: "Standard street map",
  },
  {
    id: "mapbox://styles/mapbox/satellite-v9",
    label: "Satellite",
    description: "Full satellite imagery",
  },
  {
    id: "mapbox://styles/mapbox/satellite-streets-v12",
    label: "Satellite Streets",
    description: "Satellite + street labels",
  },
  {
    id: "mapbox://styles/mapbox/outdoors-v12",
    label: "Outdoors",
    description: "Topographic style, terrain + contours",
  },
  {
    id: "mapbox://styles/mapbox/light-v10",
    label: "Light",
    description: "Light theme",
  },
  {
    id: "mapbox://styles/mapbox/dark-v10",
    label: "Dark",
    description: "Dark theme",
  },
  {
    id: "mapbox://styles/mapbox/navigation-day-v1",
    label: "Navigation Day",
    description: "Navigation style (day)",
  },
  {
    id: "mapbox://styles/mapbox/navigation-night-v1",
    label: "Navigation Night",
    description: "Navigation style (night)",
  },
];

type MapStylePanelProps = {
  isOpen: boolean;
  selectedStyleId: string;
  accessToken?: string;
  onClose: () => void;
  onSelectStyle: (styleId: string) => void;
};

function getStaticPreviewUrl(styleId: string, accessToken?: string) {
  if (!accessToken) return null;
  const normalized = styleId.replace("mapbox://styles/", "");
  const center = "-122.431297,37.773972,10,0";
  return `https://api.mapbox.com/styles/v1/${normalized}/static/${center}/520x180?access_token=${accessToken}`;
}

export default function MapStylePanel({
  isOpen,
  selectedStyleId,
  accessToken,
  onClose,
  onSelectStyle,
}: MapStylePanelProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed top-[64px] left-[56px] h-[calc(100vh-64px)] w-80 bg-white border-r shadow-2xl z-[3000] flex flex-col animate-in slide-in-from-left duration-300">
      <div className="px-4 py-3 border-b bg-gray-50/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-semibold text-slate-800">Map Style</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 flex items-center justify-center"
            aria-label="Close map style panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {MAP_STYLES.map((style) => {
          const selected = selectedStyleId === style.id;
          const previewUrl = getStaticPreviewUrl(style.id, accessToken);

          return (
            <button
              key={style.id}
              type="button"
              onClick={() => onSelectStyle(style.id)}
              className={`w-full text-left rounded-xl border bg-white overflow-hidden transition-all ${
                selected
                  ? "border-violet-400 ring-2 ring-violet-300"
                  : "border-gray-200 hover:border-gray-300"
              }`}
              title={style.label}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={`${style.label} style preview`}
                  className="block h-28 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-28 w-full bg-gradient-to-br from-slate-100 to-slate-200" />
              )}

              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{style.label}</div>
                    <div className="mt-0.5 text-xs text-slate-600">{style.description}</div>
                  </div>
                  {selected ? (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-500 text-white shrink-0">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
