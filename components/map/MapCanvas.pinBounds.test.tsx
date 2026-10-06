// @vitest-environment jsdom
//
// PATCH-296 Addendum 2, defect 2: a Map board with pins must frame them
// (fitBounds padding 64 / maxZoom 6; a single pin centres at zoom 5) and must
// NOT ask for the viewer's position or call ipapi.co. A board with no pins
// keeps the old viewer-location behaviour.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const mapApi = {
    keyboard: { disable: vi.fn(), enable: vi.fn() },
    fitBounds: vi.fn(),
    flyTo: vi.fn(),
  };
  const refObj = { getMap: () => mapApi, fitBounds: mapApi.fitBounds, flyTo: mapApi.flyTo };
  return { mapApi, refObj };
});

vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

vi.mock('react-map-gl/mapbox', async () => {
  const React = await import('react');
  const Map = React.forwardRef((props: any, ref: any) => {
    React.useEffect(() => {
      if (typeof ref === 'function') ref(hoisted.refObj);
      else if (ref) ref.current = hoisted.refObj;
      props.onLoad?.();
    }, []);
    return React.createElement('div', { 'data-testid': 'map' });
  });
  return {
    __esModule: true,
    default: Map,
    Map,
    Layer: () => null,
    Marker: () => null,
    NavigationControl: () => null,
    Source: () => null,
  };
});

vi.mock('@/components/map/MarkersLayer', () => ({ __esModule: true, default: () => null, CLUSTER_LAYER_ID: 'cluster' }));
vi.mock('@/components/map/MapSearchControl', () => ({ __esModule: true, default: () => null }));
vi.mock('@/components/map/MapSidebar', () => ({ __esModule: true, default: () => null }));
vi.mock('@/components/map/PostPopup', () => ({ __esModule: true, default: () => null }));

import MapCanvas from './MapCanvas';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'pk.test';
});

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
afterEach(() => {
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
  vi.restoreAllMocks();
});

function getCurrentPositionSpy() {
  const spy = vi.fn((_success: unknown, error?: (e: unknown) => void) => { error?.({}); });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: spy } });
  return spy;
}

async function mountMap(posts: any[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MapCanvas
        posts={posts}
        onCreatePostAtLocation={vi.fn(async () => null)}
        onUpdatePostLocation={vi.fn(async () => {})}
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  mounted.push({ root, container });
  return container;
}

function pin(lat: number, lng: number): any {
  return { id: `pin-${lat}-${lng}`, type: 'container', title: 'Pin', content: '', location_lat: lat, location_lng: lng };
}

beforeEach(() => {
  hoisted.mapApi.fitBounds.mockReset();
  hoisted.mapApi.flyTo.mockReset();
});

describe('MapCanvas pin framing (addendum 2 defect 2)', () => {
  it('frames many pins and never asks for the viewer position or ipapi', async () => {
    const geolocation = getCurrentPositionSpy();
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;
    await mountMap([pin(35.3606, 138.7274), pin(-22.4, -155.2834)]);

    expect(hoisted.mapApi.fitBounds).toHaveBeenCalledTimes(1);
    expect(hoisted.mapApi.fitBounds.mock.calls[0][0]).toEqual([
      [-155.2834, -22.4],
      [138.7274, 35.3606],
    ]);
    expect(hoisted.mapApi.fitBounds.mock.calls[0][1]).toMatchObject({ padding: 64, maxZoom: 6 });
    expect(geolocation).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('centres a single pin at zoom 5', async () => {
    const geolocation = getCurrentPositionSpy();
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;
    await mountMap([pin(35.3606, 138.7274)]);

    expect(hoisted.mapApi.flyTo).toHaveBeenCalledWith({ center: [138.7274, 35.3606], zoom: 5, duration: 900 });
    expect(hoisted.mapApi.fitBounds).not.toHaveBeenCalled();
    expect(geolocation).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the viewer-location behaviour when the board has no pins', async () => {
    const geolocation = getCurrentPositionSpy();
    const fetchSpy = vi.fn(async (url: any) => {
      if (String(url).includes('ipapi')) {
        return { json: async () => ({ longitude: 1, latitude: 2 }) };
      }
      return { json: async () => ({ features: [] }) };
    });
    globalThis.fetch = fetchSpy as any;
    await mountMap([]);

    expect(geolocation).toHaveBeenCalled();
    expect(hoisted.mapApi.fitBounds).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ padding: 64 }),
    );
  });
});
