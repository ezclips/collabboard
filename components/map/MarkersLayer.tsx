"use client";

import React, { useMemo } from 'react';
import { Layer, Source, type LayerProps } from 'react-map-gl/mapbox';
import type { Padlet } from '@/types/collabboard';
import { postsToFeatureCollection } from '@/lib/map/geojson';

export const CLUSTER_LAYER_ID = 'map-post-clusters';
export const CLUSTER_COUNT_LAYER_ID = 'map-post-cluster-count';

type MarkersLayerProps = {
  posts: Padlet[];
};

const clusterLayer: LayerProps = {
  id: CLUSTER_LAYER_ID,
  type: 'circle',
  source: 'map-posts',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#0f766e',
    'circle-radius': ['step', ['get', 'point_count'], 18, 20, 24, 100, 32],
    'circle-opacity': 0.9,
  },
};

const clusterCountLayer: LayerProps = {
  id: CLUSTER_COUNT_LAYER_ID,
  type: 'symbol',
  source: 'map-posts',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    'text-size': 12,
  },
  paint: {
    'text-color': '#ffffff',
  },
};

export default function MarkersLayer({ posts }: MarkersLayerProps) {
  const collection = useMemo(() => postsToFeatureCollection(posts), [posts]);

  return (
    <Source
      id="map-posts"
      type="geojson"
      data={collection}
      cluster={true}
      clusterRadius={50}
      clusterMaxZoom={14}
    >
      <Layer {...clusterLayer} />
      <Layer {...clusterCountLayer} />
    </Source>
  );
}
