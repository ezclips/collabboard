import type { Feature, FeatureCollection, Point } from 'geojson';
import type { Padlet } from '@/types/collabboard';

export type MapPostFeatureProps = {
  postId: string;
  color: string;
  title: string;
};

export function getPadletMapLocation(post: Padlet): { lng: number; lat: number; label?: string } | null {
  const anyPost = post as any;
  const meta = (post.metadata || {}) as Record<string, any>;
  const fromMeta = meta.mapLocation || {};

  const lngRaw = anyPost.location_lng ?? fromMeta.lng ?? meta.lng;
  const latRaw = anyPost.location_lat ?? fromMeta.lat ?? meta.lat;

  const lngCandidate = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
  const latCandidate = typeof latRaw === 'number' ? latRaw : Number(latRaw);

  if (!Number.isFinite(lngCandidate) || !Number.isFinite(latCandidate)) return null;
  if (latCandidate < -90 || latCandidate > 90 || lngCandidate < -180 || lngCandidate > 180) return null;

  return {
    lng: lngCandidate,
    lat: latCandidate,
    label: anyPost.location_label ?? fromMeta.label,
  };
}

export function postsToFeatureCollection(posts: Padlet[]): FeatureCollection<Point, MapPostFeatureProps> {
  const features: Feature<Point, MapPostFeatureProps>[] = [];

  for (const post of posts) {
    const location = getPadletMapLocation(post);
    if (!location) continue;

    const color =
      ((post.metadata as any)?.cardColor as string | undefined) ||
      ((post.metadata as any)?.topStripColor as string | undefined) ||
      '#2563eb';

    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [location.lng, location.lat],
      },
      properties: {
        postId: post.id,
        color,
        title: post.title || 'Untitled',
      },
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
