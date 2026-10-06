import { describe, expect, it } from 'vitest';
import { computeMapPinBounds } from './mapPinBounds';

describe('computeMapPinBounds', () => {
  it('returns none for no pins', () => {
    expect(computeMapPinBounds([])).toEqual({ kind: 'none' });
  });

  it('returns none when no pin has coordinates', () => {
    expect(computeMapPinBounds([{ location_lat: undefined, location_lng: undefined }])).toEqual({ kind: 'none' });
  });

  it('returns a single centre for one pin', () => {
    expect(computeMapPinBounds([{ location_lat: 35.3606, location_lng: 138.7274 }])).toEqual({
      kind: 'single',
      center: [138.7274, 35.3606],
    });
  });

  it('returns the bounding box for many pins', () => {
    expect(
      computeMapPinBounds([
        { location_lat: 35.3606, location_lng: 138.7274 },
        { location_lat: -22.4, location_lng: -155.2834 },
        { location_lat: 40.8214, location_lng: 14.426 },
      ]),
    ).toEqual({
      kind: 'multiple',
      bounds: [
        [-155.2834, -22.4],
        [138.7274, 40.8214],
      ],
    });
  });

  it('ignores invalid coordinates', () => {
    expect(
      computeMapPinBounds([
        { location_lat: Number.NaN, location_lng: 10 },
        { location_lat: 91, location_lng: 0 },
        { location_lat: 0, location_lng: 181 },
        { location_lat: 'nope', location_lng: 'nope' },
        { location_lat: 12, location_lng: 34 },
      ]),
    ).toEqual({ kind: 'single', center: [34, 12] });
  });

  it('falls back to metadata.mapLocation when the columns are absent', () => {
    expect(
      computeMapPinBounds([{ metadata: { mapLocation: { lat: 1, lng: 2 } } }]),
    ).toEqual({ kind: 'single', center: [2, 1] });
  });
});
