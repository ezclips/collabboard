import type { AIContentData, AIMode, PhotoCardData } from '@/lib/ai/contracts';
import { uploadImageToStorage } from '@/lib/ai/assets/uploadImageToStorage';
import { downloadImage } from '@/lib/ai/assets/downloadImage';

const UNSPLASH_TIMEOUT_MS = 3_000;

type UnsplashPhoto = {
  urls?: { regular?: string };
  user?: { name?: string; links?: { html?: string } };
};

type UnsplashResponse = {
  results?: UnsplashPhoto[];
};

type ResolvedImageAsset = {
  url: string | undefined;
  source?: string | null;
  author?: string | null;
  authorLink?: string | null;
};

function sanitizeForPath(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image';
}

async function resolveImageWithUnsplash(query: string): Promise<ResolvedImageAsset> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.replace(/^["']|["']$/g, '').trim();

  if (!accessKey) {
    return { url: undefined };
  }

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UNSPLASH_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      return { url: undefined };
    }

    const data = (await response.json()) as UnsplashResponse;
    const photo = data.results?.[0];

    if (!photo?.urls?.regular) {
      return { url: undefined };
    }

    return {
      url: photo.urls.regular,
      source: photo.user?.links?.html || null,
      author: photo.user?.name || null,
      authorLink: photo.user?.links?.html || null,
    };
  } catch {
    return { url: undefined };
  }
}

async function resolveAndStorePhotoCardImage(
  data: PhotoCardData,
  componentId: string,
): Promise<PhotoCardData> {
  const query = data.image.query.trim();
  if (!query) {
    return data;
  }

  const resolved = await resolveImageWithUnsplash(query);
  if (!resolved.url) {
    return data;
  }

  try {
    const downloaded = await downloadImage(resolved.url);
    const extension = downloaded.mimeType === 'image/png'
      ? 'png'
      : downloaded.mimeType === 'image/webp'
        ? 'webp'
        : 'jpg';
    const storagePath = `${componentId}/photo-card-${sanitizeForPath(query)}.${extension}`;
    const uploaded = await uploadImageToStorage(downloaded.buffer, downloaded.mimeType, storagePath);

    return {
      ...data,
      image: {
        ...data.image,
        url: uploaded.publicUrl,
      },
    };
  } catch (error) {
    console.warn('[resolve-images] Failed to store resolved photo card image:', error);
    return {
      ...data,
      image: {
        ...data.image,
        url: resolved.url,
      },
    };
  }
}

export async function enrichAIContentImages(input: {
  mode: AIMode;
  data: AIContentData;
  componentId?: string;
}): Promise<AIContentData> {
  const componentId = input.componentId
    ?? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `ai-${Date.now()}`);

  if (input.mode === 'photo_card' && input.data.type === 'photo') {
    return resolveAndStorePhotoCardImage(input.data, componentId);
  }

  return input.data;
}
