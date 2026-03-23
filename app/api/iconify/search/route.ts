import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Iconify API: https://api.iconify.design/
// Search endpoint: https://api.iconify.design/search?query=...&limit=...

function toInt(value: string | null, fallback: number) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);

    const query = (searchParams.get('query') || '').trim();
    const limit = toInt(searchParams.get('limit'), 48);

    if (!query) {
        return NextResponse.json({ icons: [], total: 0 }, { status: 200 });
    }

    // Search Iconify API
    const searchUrl = `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${limit}`;

    try {
        const res = await fetch(searchUrl, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'CollabBoard/1.0 (Next.js Server)',
            },
            cache: 'no-store',
        });

        const contentType = res.headers.get('content-type') || '';
        const text = await res.text();

        if (!contentType.includes('application/json')) {
            return NextResponse.json(
                {
                    error: 'Iconify returned non-JSON',
                    upstreamStatus: res.status,
                    upstreamContentType: contentType,
                    icons: [],
                    total: 0,
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
                    error: 'Iconify JSON parse failed',
                    upstreamStatus: res.status,
                    icons: [],
                    total: 0,
                },
                { status: 200 }
            );
        }

        // Iconify returns { icons: ["prefix:name", ...], total: number }
        // We need to transform this to include SVG URLs
        const iconNames = json.icons || [];
        const total = json.total || iconNames.length;

        // Build items with SVG URLs
        const icons = iconNames.map((fullName: string) => {
            // fullName is like "mdi:account" or "fa-solid:user"
            const [prefix, name] = fullName.includes(':')
                ? fullName.split(':')
                : [fullName.split('-')[0], fullName];

            return {
                id: fullName,
                name: name || fullName,
                prefix: prefix,
                fullName: fullName,
                // Direct SVG URL from Iconify
                svgUrl: `https://api.iconify.design/${prefix}/${name}.svg`,
            };
        });

        return NextResponse.json({ icons, total }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json(
            {
                error: 'Proxy fetch failed',
                message: err?.message || 'Unknown error',
                icons: [],
                total: 0,
            },
            { status: 200 }
        );
    }
}
