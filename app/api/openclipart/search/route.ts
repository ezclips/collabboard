import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toInt(value: string | null, fallback: number) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);

    const query = (searchParams.get('query') || '').trim();
    const page = toInt(searchParams.get('page'), 1);
    const amount = toInt(searchParams.get('amount'), 48);

    if (!query) {
        return NextResponse.json({ payload: [] }, { status: 200 });
    }

    const upstream = `https://openclipart.org/search/json/?query=${encodeURIComponent(
        query
    )}&page=${page}&amount=${amount}`;

    try {
        const res = await fetch(upstream, {
            method: 'GET',
            headers: {
                Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
                'User-Agent': 'CollabBoard/1.0 (Next.js Server)',
            },
            cache: 'no-store',
        });

        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();

        // OpenClipart sometimes returns HTML (bot protection, error pages, etc.)
        if (!contentType.includes('application/json')) {
            return NextResponse.json(
                {
                    error: 'OpenClipart returned non-JSON',
                    upstreamStatus: res.status,
                    upstreamContentType: contentType,
                    // Keep it short so we don't spam logs / responses
                    upstreamPreview: text.slice(0, 300),
                    payload: [],
                },
                { status: 200 }
            );
        }

        let json: any;
        try {
            json = JSON.parse(text);
        } catch {
            return NextResponse.json(
                {
                    error: 'OpenClipart JSON parse failed',
                    upstreamStatus: res.status,
                    upstreamContentType: contentType,
                    upstreamPreview: text.slice(0, 300),
                    payload: [],
                },
                { status: 200 }
            );
        }

        // Pass through (payload contains items)
        return NextResponse.json(json, { status: 200 });
    } catch (err: any) {
        return NextResponse.json(
            {
                error: 'Proxy fetch failed',
                message: err?.message || 'Unknown error',
                payload: [],
            },
            { status: 200 }
        );
    }
}
