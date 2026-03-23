import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple in-memory cache
// Key: normalized inputUrl, Value: { data: any, timestamp: number }
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function pickFirstMatch(html: string, patterns: RegExp[]) {
    for (const p of patterns) {
        const m = html.match(p);
        if (m && m[1]) return m[1];
    }
    return null;
}

function normalizeUrl(url: string): string {
    let cleaned = url.trim();
    if (!cleaned) return "";

    // Support plain numeric IDs (e.g., "339530")
    if (/^\d+$/.test(cleaned)) {
        return `https://openclipart.org/detail/${cleaned}`;
    }

    // Handle cases like openclipart.org/detail/123
    if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
        cleaned = "https://" + cleaned;
    }

    return cleaned;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const rawUrl = (searchParams.get("url") || "").trim();

    if (!rawUrl) {
        return NextResponse.json(
            { error: "INVALID_INPUT", message: "Missing input. Paste an OpenClipart ID or URL (e.g. 339530)" },
            { status: 400 }
        );
    }

    const inputUrl = normalizeUrl(rawUrl);

    // Validate the normalized URL contains openclipart.org
    if (!inputUrl.includes("openclipart.org")) {
        return NextResponse.json(
            { error: "INVALID_INPUT", message: "Only OpenClipart IDs or URLs are supported (e.g. 339530)" },
            { status: 400 }
        );
    }

    // Check cache
    const cached = cache.get(inputUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return NextResponse.json(cached.data, { status: 200 });
    }

    try {
        // If user pasted a direct .svg url, accept it immediately
        if (/\.svg(\?|$)/i.test(inputUrl)) {
            const result = {
                title: "OpenClipart SVG",
                pageUrl: inputUrl,
                svgUrl: inputUrl,
                source: "openclipart",
            };
            cache.set(inputUrl, { data: result, timestamp: Date.now() });
            return NextResponse.json(result, { status: 200 });
        }

        const res = await fetch(inputUrl, {
            headers: {
                "User-Agent": "CollabBoard/1.0 (Next.js Server)",
                Accept: "text/html,application/xhtml+xml,application/xml",
            },
            cache: "no-store",
        });

        if (!res.ok) {
            const errorCode = res.status === 404 ? "NOT_FOUND" : "FETCH_FAILED";
            return NextResponse.json(
                { error: errorCode, message: `Failed to fetch page: ${res.statusText}` },
                { status: res.status }
            );
        }

        const html = await res.text();

        // Parse the URL to extract the numeric ID
        const urlObj = new URL(inputUrl);
        const pageUrl = urlObj.toString();

        // Extract numeric id from path like /detail/294309 or /294309
        const idMatch = urlObj.pathname.match(/\/(\d+)(\/|$)/);
        const clipId = idMatch?.[1] || null;

        // Try specific download pattern first (more reliable than ".svg" search)
        // Search ANYWHERE in the HTML for /download/{id}/{filename}.svg
        // This catches href="...", data-url="...", or even JSON/JS strings
        let svgUrl: string | null = null;

        if (clipId) {
            // Flexible regex to find ANY reference to the download path
            // Matches: /download/12345 OR /download/12345/filename.svg
            // Pattern: (http...)? /download/ID (/filename...)?
            const downloadPattern = new RegExp(`((?:https?:\\/\\/[^\\/"'\\s]+)?\\/download\\/${clipId}(?:\\/[^"':\\s<>]+)?)(?:["'\\s]|$)`, "i");
            const m = html.match(downloadPattern);
            if (m && m[1]) {
                svgUrl = m[1];
            }
        }

        // If found download link but it's relative, normalize it
        if (svgUrl) {
            svgUrl = svgUrl.startsWith("http") ? svgUrl : new URL(svgUrl, pageUrl).toString();
        }

        // Fallback: any .svg link anywhere on the page (href="...svg")
        if (!svgUrl) {
            const fallback =
                pickFirstMatch(html, [
                    /href="([^"]+\.svg[^"]*)"/i,
                    /href='([^']+\.svg[^']*)'/i,
                    /"(https?:\/\/[^"]+\.svg[^"]*)"/i,
                    // Catch simple urls in text/scripts
                    /https?:\/\/[^"'\s]+\.svg/i
                ]) || null;

            if (fallback) {
                svgUrl = fallback.startsWith("http") ? fallback : new URL(fallback, pageUrl).toString();
            }
        }

        const title =
            pickFirstMatch(html, [
                /<h1[^>]*>([^<]+)<\/h1>/i,
                /<title>([^<]+)<\/title>/i,
            ]) || "OpenClipart";

        if (!svgUrl) {
            return NextResponse.json(
                {
                    error: "NO_SVG_LINK_FOUND",
                    message: `Could not find an SVG link on this OpenClipart page (ID: ${clipId || 'unknown'}). Try copying the direct download URL.`,
                },
                { status: 404 }
            );
        }

        const absoluteSvgUrl = svgUrl.startsWith("http") ? svgUrl : new URL(svgUrl, inputUrl).toString();

        // Validate SVG content
        let svgText: string | null = null;
        try {
            // Use a standard browser User-Agent
            const svgRes = await fetch(absoluteSvgUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                },
            });
            if (svgRes.ok && svgRes.headers.get('content-type')?.includes('image/svg+xml')) {
                // Only fetch text if content-type looks right or if we want to be strict
                // But OpenClipart sometimes serves text/plain or text/xml
            }

            if (svgRes.ok) {
                svgText = await svgRes.text();
                // Basic validation: must contain <svg tag
                if (!svgText.includes("<svg")) {
                    return NextResponse.json(
                        { error: "SVG_INVALID", message: "The resolved URL did not return valid SVG content." },
                        { status: 422 } // Unprocessable Entity
                    );
                }
            } else {
                return NextResponse.json(
                    { error: "SVG_FETCH_FAILED", message: `Failed to fetch SVG content: ${svgRes.statusText}` },
                    { status: 502 }
                );
            }
        } catch (e: any) {
            return NextResponse.json(
                { error: "SVG_FETCH_FAILED", message: `Failed to fetch SVG content: ${e.message}` },
                { status: 502 }
            );
        }

        const result = {
            id: clipId,
            title: title.trim().replace(/\s+/g, ' '),
            pageUrl: inputUrl,
            svgUrl: absoluteSvgUrl,
            svgText: svgText || undefined,
            source: "openclipart",
        };

        // Store in cache
        cache.set(inputUrl, { data: result, timestamp: Date.now() });

        return NextResponse.json(result, { status: 200 });
    } catch (e: any) {
        console.error('OpenClipart resolve failed:', e);
        return NextResponse.json({ error: "INTERNAL_ERROR", message: e?.message || "Resolve failed" }, { status: 500 });
    }
}
