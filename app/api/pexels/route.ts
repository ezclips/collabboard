import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';

/**
 * PATCH-219. The Pexels proxy.
 *
 * It now requires a signed-in user: it was open to anyone, so any visitor could
 * spend the app's Pexels quota. Its only callers -- ImageEditor's "Free images"
 * tab and IconSelector -- are editor surfaces behind a session, so this refuses
 * nothing a real user needs.
 *
 * Two modes share the route: `?query=…` searches, and no query returns Pexels'
 * curated feed (the "Recommended" photos). Both are cached at the fetch layer and
 * keep Pexels' JSON shape unchanged, so both callers keep working.
 */

export const runtime = 'nodejs';

const PER_PAGE = 24;
const CURATED_REVALIDATE_SECONDS = 3600;
const SEARCH_REVALIDATE_SECONDS = 600;
const MAX_QUERY_LENGTH = 100;
const MAX_PAGE = 50;

/** An integer page in `[1, MAX_PAGE]`, or null when the value is not valid. */
function parsePage(raw: string | null): number | null {
  if (raw === null) return 1;
  if (!/^\d+$/.test(raw)) return null;
  const page = Number(raw);
  if (page < 1 || page > MAX_PAGE) return null;
  return page;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to search images' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get('query');
  const query = rawQuery === null ? '' : rawQuery.trim();
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: 'Search is too long' }, { status: 400 });
  }

  const page = parsePage(searchParams.get('page'));
  if (page === null) {
    return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
  }

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Pexels API key not configured' }, { status: 500 });
  }

  const isSearch = query.length > 0;
  const upstream = isSearch
    ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}`
    : `https://api.pexels.com/v1/curated?per_page=${PER_PAGE}&page=${page}`;

  try {
    const response = await fetch(upstream, {
      headers: { Authorization: apiKey },
      next: {
        revalidate: isSearch ? SEARCH_REVALIDATE_SECONDS : CURATED_REVALIDATE_SECONDS,
      },
    });

    if (response.status === 429) {
      return NextResponse.json(
        { error: 'Image search is busy. Please try again in a minute.' },
        { status: 429 },
      );
    }
    if (!response.ok) {
      // The raw upstream body is never forwarded.
      throw new Error(`Pexels API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Pexels API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch from Pexels' }, { status: 500 });
  }
}
