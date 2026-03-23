"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Marker, NavigationControl, type MapMouseEvent, type MapRef } from 'react-map-gl/mapbox';
type MapLayerMouseEvent = MapMouseEvent;
import 'mapbox-gl/dist/mapbox-gl.css';
import type mapboxgl from 'mapbox-gl';
import type { BoardSection, Padlet } from '@/types/collabboard';
import { getPadletMapLocation } from '@/lib/map/geojson';
import MapSearchControl from '@/components/map/MapSearchControl';
import MarkersLayer, {
  CLUSTER_LAYER_ID,
} from '@/components/map/MarkersLayer';
import PostPopup from '@/components/map/PostPopup';
import MapSidebar from '@/components/map/MapSidebar';

type CreateMode = 'idle' | 'search' | 'dropPin' | 'compose' | 'reposition';

type ClickableFeature = {
  layer?: { id?: string };
  properties?: { cluster_id?: number; postId?: string };
  geometry: { coordinates: [number, number] };
};

type PinMetadata = {
  childPadletIds?: string[];
  cardColor?: string;
};

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const value = color.trim();
  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

function getContrastTextColor(bgColor: string): '#0f172a' | '#ffffff' {
  const rgb = hexToRgb(bgColor);
  if (!rgb) return '#ffffff';
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
  return luminance > 0.45 ? '#0f172a' : '#ffffff';
}

type AddressPickerContext = {
  mode: 'create' | 'reposition' | 'pin';
  lng: number;
  lat: number;
  postId?: string;
};

type MapCanvasProps = {
  posts: Padlet[];
  mapStyle?: string;
  canEditPosts?: boolean;
  onCreatePostAtLocation: (location: { lng: number; lat: number; label?: string }) => Promise<Padlet | null>;
  onUpdatePostLocation: (postId: string, location: { lng: number; lat: number; label?: string }) => Promise<void>;
  onPinContainerOpen?: (post: Padlet) => void;
  onPinContainerClose?: () => void;
  onEditPinContainer?: (post: Padlet) => void;
  onEditPinPost?: (post: Padlet) => void;
  onDeletePinContainer?: (post: Padlet) => void;
  onChangePinContainerColor?: (post: Padlet, color: string) => void;
  sections?: BoardSection[];
  canManageSections?: boolean;
  canReorderPosts?: boolean;
  isSidebarOpen?: boolean;
  onSidebarClose?: () => void;
  onAddSection?: () => void;
  onRenameSection?: (sectionId: string, title: string) => void;
  onDeleteSection?: (sectionId: string) => void;
  onReorderSections?: (sectionIdsInOrder: string[]) => void;
  onMovePostToSection?: (postId: string, toSectionId: string | null, toIndex: number) => void;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onUpdateChildComments?: (childId: string, comments: unknown[]) => void;
  onRefreshChildren?: () => void;
};

export default function MapCanvas({
  posts,
  mapStyle = 'mapbox://styles/mapbox/streets-v12',
  canEditPosts = false,
  onCreatePostAtLocation,
  onUpdatePostLocation,
  onPinContainerOpen,
  onPinContainerClose,
  onEditPinContainer,
  onEditPinPost,
  onDeletePinContainer,
  onChangePinContainerColor,
  sections = [],
  canManageSections = false,
  canReorderPosts = false,
  isSidebarOpen = true,
  onSidebarClose,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  onReorderSections,
  onMovePostToSection,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onUpdateChildComments,
  onRefreshChildren,
}: MapCanvasProps) {
  const mapRef = useRef<MapRef | null>(null);
  const didAutoLocateRef = useRef(false);
  const mapToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const [createMode, setCreateMode] = useState<CreateMode>('idle');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [draftLocation, setDraftLocation] = useState<{ lng: number; lat: number; label?: string } | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'manual' | 'automatic'>('manual');
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(new Set());
  const [addressPicker, setAddressPicker] = useState<AddressPickerContext | null>(null);
  const [addressOptions, setAddressOptions] = useState<string[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const geocodeAbortRef = useRef<AbortController | null>(null);

  const postsWithLocation = useMemo(
    () => posts.filter((post) => getPadletMapLocation(post) !== null),
    [posts]
  );
  const childCountsByParentId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of posts) {
      const metadata = (p.metadata ?? {}) as Record<string, unknown>;
      const parentId = typeof metadata.parentId === 'string' ? metadata.parentId : null;
      if (!parentId) continue;
      counts[parentId] = (counts[parentId] || 0) + 1;
    }
    return counts;
  }, [posts]);

  useEffect(() => {
    if (!selectedPostId) return;
    const selected = posts.find((p) => p.id === selectedPostId);
    if (!selected) return;
    const selectedMeta = (selected.metadata ?? {}) as Record<string, unknown>;
    const sectionId = (selectedMeta.sectionId ?? '__unplaced__').toString();
    setCollapsedSectionIds((prev) => {
      if (!prev.has(sectionId)) return prev;
      const next = new Set(prev);
      next.delete(sectionId);
      return next;
    });
  }, [selectedPostId, posts]);

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (selectedPostId) map.keyboard.disable();
    else map.keyboard.enable();
    return () => {
      map.keyboard.enable();
    };
  }, [selectedPostId, mapLoaded]);

  useEffect(() => {
    if (!mapLoaded || !mapToken || didAutoLocateRef.current) return;
    didAutoLocateRef.current = true;

    const getBrowserCoords = async (): Promise<{ lng: number; lat: number } | null> => {
      if (typeof window === 'undefined' || !navigator.geolocation) return null;
      return await new Promise((resolve) => {
        const timeout = window.setTimeout(() => resolve(null), 3500);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            window.clearTimeout(timeout);
            resolve({ lng: position.coords.longitude, lat: position.coords.latitude });
          },
          () => {
            window.clearTimeout(timeout);
            resolve(null);
          },
          { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 }
        );
      });
    };

    const getIpCoords = async (): Promise<{ lng: number; lat: number } | null> => {
      try {
        const ipResponse = await fetch('https://ipapi.co/json/');
        const ipJson = (await ipResponse.json()) as { longitude?: number; latitude?: number };
        if (typeof ipJson.longitude === 'number' && typeof ipJson.latitude === 'number') {
          return { lng: ipJson.longitude, lat: ipJson.latitude };
        }
      } catch {
        // ignore
      }
      return null;
    };

    const fitCountryFromCoords = async (coords: { lng: number; lat: number }) => {
      const endpoint =
        `https://api.mapbox.com/search/searchbox/v1/reverse?longitude=${coords.lng}` +
        `&latitude=${coords.lat}&types=country&limit=1&access_token=${mapToken}`;

      try {
        const response = await fetch(endpoint);
        const json = (await response.json()) as {
          features?: Array<{ bbox?: [number, number, number, number] }>;
        };
        const bbox = json.features?.[0]?.bbox;
        if (Array.isArray(bbox) && bbox.length === 4) {
          mapRef.current?.fitBounds(
            [
              [bbox[0], bbox[1]],
              [bbox[2], bbox[3]],
            ],
            { padding: 48, duration: 900 }
          );
          return;
        }
      } catch {
        // ignore and fallback below
      }

      mapRef.current?.flyTo({ center: [coords.lng, coords.lat], zoom: 5, duration: 900 });
    };

    void (async () => {
      const browser = await getBrowserCoords();
      const coords = browser ?? (await getIpCoords());
      if (!coords) return;
      await fitCountryFromCoords(coords);
    })();
  }, [mapLoaded, mapToken]);

  if (!mapToken) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-700">
        Set NEXT_PUBLIC_MAPBOX_TOKEN to enable Map canvas.
      </div>
    );
  }

  const flyTo = (lng: number, lat: number) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 13, duration: 900 });
  };

  const handleSelectLocation = (location: { lng: number; lat: number; label?: string }) => {
    setDraftLocation(location);
    setCreateMode('compose');
    flyTo(location.lng, location.lat);
  };

  const handleMapClick = (event: MapMouseEvent) => {
    if (createMode === 'dropPin') {
      const loc = { lng: event.lngLat.lng, lat: event.lngLat.lat };
      setDraftLocation(loc);
      setCreateMode('compose');
      void openAddressPicker({ mode: 'create', lng: loc.lng, lat: loc.lat });
      return;
    }

    if (createMode === 'reposition') {
      const loc = { lng: event.lngLat.lng, lat: event.lngLat.lat };
      setDraftLocation(loc);
      if (editingPostId) {
        void openAddressPicker({ mode: 'reposition', lng: loc.lng, lat: loc.lat, postId: editingPostId });
      }
      return;
    }

    setSelectedPostId(null);
    onPinContainerClose?.();
  };

  const eventCameFromPopup = (event: MapMouseEvent | MapLayerMouseEvent) => {
    const original = event.originalEvent as Event | undefined;
    const target = original?.target;
    return target instanceof Element && Boolean(target.closest('[data-map-popup-root="true"]'));
  };

  const handleFeatureClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0] as unknown as ClickableFeature | undefined;
    if (!feature) return;

    if (feature.layer?.id === CLUSTER_LAYER_ID) {
      const clusterId = feature.properties?.cluster_id;
      const source = mapRef.current?.getSource('map-posts') as mapboxgl.GeoJSONSource | undefined;
      if (!source || clusterId == null) return;
      source.getClusterExpansionZoom(clusterId, ((err: Error | null, zoom: number) => {
        if (err) return;
        mapRef.current?.easeTo({ center: feature.geometry.coordinates, zoom, duration: 400 });
      }) as any);
      return;
    }

  };

  const startReposition = (post: Padlet) => {
    const location = getPadletMapLocation(post);
    if (!location) return;
    setEditingPostId(post.id);
    setDraftLocation({ lng: location.lng, lat: location.lat, label: location.label });
    setSelectedPostId(null);
    setCreateMode('reposition');
  };

  const openPinContainer = (post: Padlet) => {
    setSelectedPostId(post.id);
    onPinContainerOpen?.(post);
  };

  const handleSidebarSelectPost = (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const location = getPadletMapLocation(post);
    if (location) flyTo(location.lng, location.lat);
    openPinContainer(post);
  };

  const coordinateFallbackLabel = (lng: number, lat: number) => `${lat.toFixed(12)}, ${lng.toFixed(12)}`;

  const loadNearbyAddresses = async (lng: number, lat: number, signal?: AbortSignal) => {
    if (!mapToken) return [coordinateFallbackLabel(lng, lat)];

    const endpoint =
      `https://api.mapbox.com/search/searchbox/v1/reverse?longitude=${lng}` +
      `&latitude=${lat}&limit=5&types=address,street,poi&language=en&access_token=${mapToken}`;

    try {
      const response = await fetch(endpoint, { signal });
      const json = (await response.json()) as {
        features?: Array<{
          place_name?: string;
          text?: string;
          properties?: {
            full_address?: string;
            name?: string;
            name_preferred?: string;
            place_formatted?: string;
            context?: { country?: { name?: string } };
          };
        }>;
      };

      const mapped = (json.features || [])
        .map((f) =>
          f.properties?.full_address ||
          f.place_name ||
          f.properties?.place_formatted ||
          f.properties?.name_preferred ||
          f.properties?.name ||
          f.text ||
          null
        )
        .filter((v): v is string => Boolean(v && v.trim()));

      const unique = Array.from(new Set(mapped));
      return [...unique.slice(0, 5), coordinateFallbackLabel(lng, lat)];
    } catch {
      return [coordinateFallbackLabel(lng, lat)];
    }
  };

  const openAddressPicker = async (context: AddressPickerContext) => {
    geocodeAbortRef.current?.abort();
    const controller = new AbortController();
    geocodeAbortRef.current = controller;
    setAddressPicker(context);
    setAddressLoading(true);
    setAddressOptions([]);
    try {
      const options = await loadNearbyAddresses(context.lng, context.lat, controller.signal);
      if (!controller.signal.aborted) {
        setAddressOptions(options);
        setAddressLoading(false);
      }
    } catch {
      if (!controller.signal.aborted) {
        setAddressOptions([coordinateFallbackLabel(context.lng, context.lat)]);
        setAddressLoading(false);
      }
    }
  };

  const applyAddressSelection = async (label: string) => {
    if (!addressPicker) return;
    const { mode, postId, lng, lat } = addressPicker;

    if (mode === 'create') {
      const created = await onCreatePostAtLocation({ lng, lat, label });
      if (created) {
        setSelectedPostId(created.id);
        onPinContainerOpen?.(created);
      }
      setDraftLocation(null);
      setCreateMode('idle');
    } else if (postId) {
      await onUpdatePostLocation(postId, { lng, lat, label });
      const post = posts.find((p) => p.id === postId);
      if (post) openPinContainer(post);
      if (mode === 'reposition') {
        setEditingPostId(null);
        setDraftLocation(null);
        setCreateMode('idle');
      }
    }

    setAddressPicker(null);
    setAddressOptions([]);
    setAddressLoading(false);
  };

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={mapToken}
        mapStyle={mapStyle}
        initialViewState={{ longitude: 8.5417, latitude: 47.3769, zoom: 1.8 }}
        style={{ width: '100%', height: '100%' }}
        dragRotate={false}
        interactiveLayerIds={[CLUSTER_LAYER_ID]}
        onLoad={() => setMapLoaded(true)}
        onClick={(event) => {
          if (eventCameFromPopup(event)) return;
          if (event.features?.length) {
            handleFeatureClick(event as unknown as MapLayerMouseEvent);
            return;
          }
          handleMapClick(event);
        }}
      >
        <NavigationControl position="bottom-right" />
        <MarkersLayer posts={postsWithLocation} />

        {postsWithLocation.map((post) => {
          const location = getPadletMapLocation(post);
          if (!location) return null;
          if (createMode === 'reposition' && editingPostId === post.id) return null;
          const isSelected = selectedPostId === post.id;
          const metadata = (post.metadata as PinMetadata | undefined) || {};
          const metadataCount = Array.isArray(metadata.childPadletIds) ? metadata.childPadletIds.length : 0;
          const parentLinkedCount = childCountsByParentId[post.id] || 0;
          const commentCount = post.type === 'comment' || (post.type as string) === 'Comment'
            ? (Array.isArray((post.metadata as Record<string, unknown>)?.comments)
                ? ((post.metadata as Record<string, unknown>).comments as unknown[]).length
                : 0)
            : 0;
          const count = Math.max(metadataCount, parentLinkedCount, commentCount);
          const pinColor =
            typeof metadata.cardColor === 'string' && metadata.cardColor.trim().length > 0
              ? metadata.cardColor
              : '#0f172a';
          const pinTextColor = getContrastTextColor(pinColor);
          const pinTextOutlineColor = pinTextColor === '#ffffff' ? '#0f172a' : '#ffffff';
          const pinStrokeColor = '#334155';
          return (
            <Marker
              key={post.id}
              longitude={location.lng}
              latitude={location.lat}
              anchor="bottom"
              style={{ zIndex: isSelected ? 10000 : 1 }}
            >
              <div className="group relative">
                {isSelected ? (
                  <div className="pointer-events-auto absolute bottom-full left-1/2 z-30 mb-5 -translate-x-1/2">
                    <PostPopup
                      post={post}
                      allPadlets={posts}
                      canEdit={canEditPosts}
                      onClose={() => {
                        setSelectedPostId(null);
                      }}
                      onEditContainer={(targetPost) => {
                        onEditPinContainer?.(targetPost);
                      }}
                      onEditPost={(targetPost) => {
                        onEditPinPost?.(targetPost);
                      }}
                      onDeleteContainer={(targetPost) => {
                        onDeletePinContainer?.(targetPost);
                        setSelectedPostId(null);
                      }}
                      onChangeContainerColor={(targetPost, color) => {
                        onChangePinContainerColor?.(targetPost, color);
                      }}
                      onEditLocation={(targetPost) => {
                        startReposition(targetPost);
                      }}
                      currentUserId={currentUserId}
                      currentUserName={currentUserName}
                      currentUserAvatar={currentUserAvatar}
                      onUpdateChildComments={onUpdateChildComments}
                      onRefreshChildren={onRefreshChildren}
                    />
                  </div>
                ) : null}

                <button
                  type="button"
                  className="cursor-pointer bg-transparent p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    openPinContainer(post);
                  }}
                  aria-label={`Open map post ${post.title || post.id}`}
                >
                  <svg
                    width="34"
                    height="42"
                    viewBox="0 0 34 42"
                    aria-hidden="true"
                    className="drop-shadow"
                  >
                    <path
                      d="M17 2
                         A14 14 0 1 1 8.2 28.9
                         L17 39
                         L25.8 28.9
                         A14 14 0 1 1 17 2Z"
                      fill={pinColor}
                      stroke={pinStrokeColor}
                      strokeWidth="1.5"
                    />
                    <text
                      x="17"
                      y="16"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill={pinTextColor}
                      style={{
                        paintOrder: 'stroke',
                        stroke: pinTextOutlineColor,
                        strokeWidth: 1.25,
                        strokeLinejoin: 'round',
                      }}
                    >
                      {count}
                    </text>
                  </svg>
                </button>
              </div>
            </Marker>
          );
        })}

        {draftLocation ? (
          <Marker
            longitude={draftLocation.lng}
            latitude={draftLocation.lat}
            anchor="bottom"
            draggable={true}
            onDragEnd={(e) => {
              const loc = { lng: e.lngLat.lng, lat: e.lngLat.lat };
              setDraftLocation({ ...draftLocation, ...loc });
              if (addressPicker) {
                void openAddressPicker({ ...addressPicker, lng: loc.lng, lat: loc.lat });
              } else if (createMode === 'compose') {
                void openAddressPicker({ mode: 'create', lng: loc.lng, lat: loc.lat });
              } else if (createMode === 'reposition' && editingPostId) {
                void openAddressPicker({ mode: 'reposition', lng: loc.lng, lat: loc.lat, postId: editingPostId });
              }
            }}
            style={{ zIndex: 10001 }}
          >
            <div className="pointer-events-none">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-[11px] font-semibold text-white shadow">
                {createMode === 'reposition' ? '1' : '+'}
              </div>
              <div className="mx-auto -mt-1 h-3 w-3 rotate-45 border-b-2 border-r-2 border-white bg-amber-500 shadow" />
            </div>
          </Marker>
        ) : null}
      </Map>

      <MapSearchControl
        accessToken={mapToken}
        onSelectLocation={handleSelectLocation}
        onDropPin={() => setCreateMode('dropPin')}
        onCancel={
          createMode !== 'idle'
            ? () => {
                setCreateMode('idle');
                setDraftLocation(null);
                setEditingPostId(null);
              }
            : undefined
        }
        isDropPinActive={createMode === 'dropPin'}
      />

      {isSidebarOpen ? (
        <MapSidebar
          boardTitle="My map pins"
          sections={sections}
          posts={posts}
          selectedPostId={selectedPostId}
          collapsedSectionIds={collapsedSectionIds}
          sortMode={sortMode}
          canManageSections={canManageSections}
          canReorderPosts={canReorderPosts}
          onSelectPost={handleSidebarSelectPost}
          onToggleSection={(sectionId) =>
            setCollapsedSectionIds((prev) => {
              const next = new Set(prev);
              if (next.has(sectionId)) next.delete(sectionId);
              else next.add(sectionId);
              return next;
            })
          }
          onSetSortMode={setSortMode}
          onAddSection={() => onAddSection?.()}
          onRenameSection={(sectionId, title) => onRenameSection?.(sectionId, title)}
          onDeleteSection={(sectionId) => onDeleteSection?.(sectionId)}
          onReorderSections={(ids) => onReorderSections?.(ids)}
          onMovePost={(postId, toSectionId, toIndex) => onMovePostToSection?.(postId, toSectionId, toIndex)}
          onClose={onSidebarClose}
        />
      ) : null}

      {addressPicker ? (
        <div className="absolute right-3 top-12 z-30 w-64 rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
            <span className="text-xs font-semibold text-slate-800">What are you pinning?</span>
            <button
              type="button"
              className="text-[10px] text-slate-400 hover:text-slate-700"
              onClick={() => {
                setAddressPicker(null);
                setAddressOptions([]);
                setAddressLoading(false);
              }}
            >
              ✕
            </button>
          </div>
          <div className="text-center text-[10px] text-slate-400 py-0.5">Drag pin to refresh</div>
          <div className="max-h-52 overflow-y-auto px-2 py-0.5">
            {addressLoading ? (
              <div className="px-1 py-2 text-xs text-slate-500">Loading…</div>
            ) : (
              addressOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="block w-full border-b border-slate-50 px-1.5 py-1.5 text-left text-[11px] leading-snug text-slate-700 hover:bg-slate-50"
                  onClick={() => void applyAddressSelection(option)}
                >
                  {option}
                </button>
              ))
            )}
          </div>
        </div>
      ) : (createMode === 'compose' || createMode === 'reposition') && draftLocation ? (
        <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-md border bg-white p-2 shadow">
          <span className="text-xs text-slate-500">Drag the pin, then addresses will appear</span>
        </div>
      ) : null}
    </div>
  );
}
