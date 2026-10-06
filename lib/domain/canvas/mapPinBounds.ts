/**
 * PATCH-296 Addendum 2. Pure map-pin bounds. A Map board must open on its own
 * pins, so the caller asks this helper what to frame; the viewer's own
 * location is only consulted when there are no pins at all.
 */

export interface MapPinLike {
  location_lat?: unknown;
  location_lng?: unknown;
  metadata?: Record<string, unknown> | null;
}

export type MapPinBounds =
  | { kind: 'none' }
  | { kind: 'single'; center: [number, number] }
  | { kind: 'multiple'; bounds: [[number, number], [number, number]] };

function toCoordinate(pin: MapPinLike): [number, number] | null {
  const metaLocation = pin.metadata?.mapLocation as { lat?: unknown; lng?: unknown } | undefined;
  const lngRaw = pin.location_lng ?? metaLocation?.lng;
  const latRaw = pin.location_lat ?? metaLocation?.lat;
  if (lngRaw === '' || latRaw === '') return null;
  const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
  const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat];
}

export function computeMapPinBounds(pins: readonly MapPinLike[]): MapPinBounds {
  const coordinates = pins
    .map(toCoordinate)
    .filter((coordinate): coordinate is [number, number] => coordinate !== null);

  if (coordinates.length === 0) return { kind: 'none' };
  if (coordinates.length === 1) return { kind: 'single', center: coordinates[0] };

  let minLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLng = coordinates[0][0];
  let maxLat = coordinates[0][1];
  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return {
    kind: 'multiple',
    bounds: [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
  };
}
