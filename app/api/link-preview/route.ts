import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import dns from 'node:dns/promises';
import net from 'node:net';
import type { LookupAddress } from 'node:dns';
import { buildYouTubeThumbCandidates, extractYouTubeId } from '@/lib/media/youtubeThumb';

export const runtime = 'nodejs';

// Helper to extract domain from URL
function extractDomain(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '');
    } catch {
        return '';
    }
}

// Helper to get favicon URL
function getFaviconUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch {
        return '';
    }
}

// Helper to decode HTML entities
function decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#x27;': "'",
        '&apos;': "'",
        '&nbsp;': ' ',
        '&#x2F;': '/',
        '&#x60;': '`',
        '&#x3D;': '=',
    };

    // Replace named and numeric entities
    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
        decoded = decoded.replace(new RegExp(entity, 'gi'), char);
    }

    // Handle numeric entities like &#123; or &#x7B;
    decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    return decoded;
}

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies();
        const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const { url } = await request.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        // SSRF guard: only allow http/https and block private address space
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch {
            return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
        }
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return NextResponse.json({ error: 'Invalid URL scheme' }, { status: 400 });
        }
        const hostname = parsedUrl.hostname.toLowerCase();
        const blockedPatterns = [
            /^localhost$/,
            /^127\./,
            /^10\./,
            /^172\.(1[6-9]|2\d|3[01])\./,
            /^192\.168\./,
            /^169\.254\./,
            /^0\./,
            /^::1$/,
            /^fc[0-9a-f]{2}:/i,
            /^fe80:/i,
            /^metadata\.google\.internal$/,
            /^100\.100\.100\.200$/,
        ];
        if (blockedPatterns.some((re) => re.test(hostname))) {
            return NextResponse.json({ error: 'URL host is not allowed' }, { status: 400 });
        }

        // DNS rebinding gap closure: if the hostname is not a literal IP, resolve it
        // and re-check every returned address against the same private-range blocklist.
        if (!net.isIP(hostname)) {
            let resolved: LookupAddress[];
            try {
                resolved = await dns.lookup(hostname, { all: true });
            } catch {
                return NextResponse.json({ error: 'Could not resolve hostname' }, { status: 400 });
            }
            for (const { address } of resolved) {
                if (blockedPatterns.some((re) => re.test(address))) {
                    return NextResponse.json({ error: 'URL host is not allowed' }, { status: 400 });
                }
            }
        }

        // Fetch the page
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
            },
        });

        if (!response.ok) {
            return NextResponse.json({
                url,
                domain: extractDomain(url),
                favicon: getFaviconUrl(url),
                title: '',
                description: '',
                image: '',
            });
        }

        const html = await response.text();

        // Extract Open Graph and meta tags
        const getMetaContent = (property: string): string => {
            // Try og: tags first
            const ogMatch = html.match(new RegExp(`<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']*)["']`, 'i'));
            if (ogMatch) return ogMatch[1];

            // Try twitter: tags
            const twitterMatch = html.match(new RegExp(`<meta[^>]*name=["']twitter:${property}["'][^>]*content=["']([^"']*)["']`, 'i'));
            if (twitterMatch) return twitterMatch[1];

            // Try reversed attribute order
            const reversedOg = html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${property}["']`, 'i'));
            if (reversedOg) return reversedOg[1];

            // Try regular meta tags
            if (property === 'description') {
                const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
                if (descMatch) return descMatch[1];
            }

            return '';
        };

        // Extract title
        let title = getMetaContent('title');
        if (!title) {
            const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
            title = titleMatch ? titleMatch[1].trim() : '';
        }

        // Extract description
        const description = getMetaContent('description');

        // Extract image
        let image = getMetaContent('image');

        // Prefer high-res YouTube thumbnail (better than many og:image defaults).
        const youtubeId = extractYouTubeId(url);
        if (youtubeId) {
            image = buildYouTubeThumbCandidates(youtubeId)[0];
        }

        // Make relative URLs absolute
        if (image && !image.startsWith('http')) {
            try {
                const urlObj = new URL(url);
                image = image.startsWith('/')
                    ? `${urlObj.protocol}//${urlObj.host}${image}`
                    : `${urlObj.protocol}//${urlObj.host}/${image}`;
            } catch {
                // Keep as-is if URL parsing fails
            }
        }

        return NextResponse.json({
            url,
            domain: extractDomain(url),
            favicon: getFaviconUrl(url),
            title: decodeHtmlEntities(title || ''),
            description: decodeHtmlEntities(description || ''),
            image: image || '',
        });
    } catch (error) {
        console.error('Link preview error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch link preview' },
            { status: 500 }
        );
    }
}
