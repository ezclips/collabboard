import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { downloadImage } from '@/lib/ai/assets/downloadImage';
import { uploadImageToStorage } from '@/lib/ai/assets/uploadImageToStorage';
import { replaceAssetUrlsInCode } from '@/lib/ai/assets/replaceAssetUrlsInCode';
import type { StoredAIImageAsset } from '@/types/collabboard';

const PLACEHOLDER_URL = '/images/ai-placeholder.svg';

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type IncomingImageAsset = {
  query: string;
  placeholder?: string;
  url: string | null;
  status: 'resolved' | 'unresolved';
  source: string | null;
  author?: string | null;
  authorLink?: string | null;
  width?: number | null;
  height?: number | null;
};

type SaveRequest = {
  componentId: string;
  code: string;
  rawCode: string;
  assets: {
    images: IncomingImageAsset[];
  };
};

type IngestResult = {
  asset: StoredAIImageAsset;
  replacementUrl: string;
};

async function ingestImage(
  image: IncomingImageAsset,
  componentId: string,
  index: number
): Promise<IngestResult> {
  const assetId = `img_${String(index + 1).padStart(3, '0')}`;
  const placeholder = image.placeholder || `[SEARCH_IMAGE: ${image.query}]`;
  const originalUrl = image.url;

  if (!originalUrl || image.status !== 'resolved') {
    return {
      asset: {
        id: assetId,
        query: image.query,
        placeholder,
        originalUrl: null,
        storagePath: null,
        publicUrl: null,
        source: 'fallback',
        status: 'unresolved',
        mimeType: null,
        width: image.width ?? null,
        height: image.height ?? null,
        authorName: image.author ?? null,
        authorLink: image.authorLink ?? null,
      },
      replacementUrl: PLACEHOLDER_URL,
    };
  }

  try {
    const downloaded = await downloadImage(originalUrl);
    const ext = EXT_MAP[downloaded.mimeType] ?? 'jpg';
    const storagePath = `${componentId}/${assetId}.${ext}`;
    const uploaded = await uploadImageToStorage(downloaded.buffer, downloaded.mimeType, storagePath);

    return {
      asset: {
        id: assetId,
        query: image.query,
        placeholder,
        originalUrl,
        storagePath: uploaded.storagePath,
        publicUrl: uploaded.publicUrl,
        source: 'unsplash',
        status: 'stored',
        mimeType: downloaded.mimeType,
        width: image.width ?? null,
        height: image.height ?? null,
        authorName: image.author ?? null,
        authorLink: image.authorLink ?? null,
      },
      replacementUrl: uploaded.publicUrl,
    };
  } catch (err) {
    console.error(`[save-generated-component] Failed to ingest image "${image.query}":`, err);
    return {
      asset: {
        id: assetId,
        query: image.query,
        placeholder,
        originalUrl,
        storagePath: null,
        publicUrl: null,
        source: 'fallback',
        status: 'failed',
        mimeType: null,
        width: image.width ?? null,
        height: image.height ?? null,
        authorName: image.author ?? null,
        authorLink: image.authorLink ?? null,
      },
      replacementUrl: PLACEHOLDER_URL,
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = (await req.json()) as SaveRequest;
    const { componentId, code, rawCode, assets } = body;

    if (!componentId || !code) {
      return NextResponse.json({ error: 'componentId and code are required' }, { status: 400 });
    }

    const images = (assets?.images ?? []).slice(0, 3);

    const results = await Promise.all(
      images.map((image, index) => ingestImage(image, componentId, index))
    );

    const assetManifest: StoredAIImageAsset[] = results.map((r) => r.asset);

    const replacements = results
      .filter((r) => r.asset.originalUrl !== null && r.asset.originalUrl !== r.replacementUrl)
      .map((r) => ({ from: r.asset.originalUrl!, to: r.replacementUrl }));

    const finalCode = replaceAssetUrlsInCode(code, replacements);

    return NextResponse.json({
      finalCode,
      rawCode,
      assetManifest,
    });
  } catch (error) {
    console.error('[save-generated-component] Internal error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
