import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory cache: pageUrl → { data, timestamp }
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours

function normalizeUrl(url: string): string {
    let cleaned = url.trim();
    if (!cleaned) return "";

    // Add protocol if missing
    if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
        cleaned = "https://" + cleaned;
    }

    return cleaned;
}

// Helper to pick first matching regex group
function pickFirstMatch(html: string, patterns: RegExp[]): string | null {
    for (const p of patterns) {
        const m = html.match(p);
        if (m && m[1]) return m[1];
    }
    return null;
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const rawUrl = searchParams.get("url") || "";

    const inputUrl = normalizeUrl(rawUrl);

    if (!inputUrl) {
        return NextResponse.json(
            { error: "INVALID_INPUT", message: "No URL provided. Example: https://publicdomainvectors.org/en/free-clipart/..." },
            { status: 400 }
        );
    }

    if (!inputUrl.includes("publicdomainvectors.org")) {
        return NextResponse.json(
            { error: "INVALID_INPUT", message: "URL must be from publicdomainvectors.org" },
            { status: 400 }
        );
    }

    // Check cache
    const cached = cache.get(inputUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return NextResponse.json(cached.data, { status: 200 });
    }

    // If already a direct SVG URL, return it as-is
    if (inputUrl.toLowerCase().endsWith(".svg")) {
        const result = {
            title: "PublicDomainVectors",
            pageUrl: inputUrl,
            svgUrl: inputUrl,
            source: "publicdomainvectors",
        };
        cache.set(inputUrl, { data: result, timestamp: Date.now() });
        return NextResponse.json(result, { status: 200 });
    }

    try {
        const res = await fetch(inputUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        });

        if (!res.ok) {
            const errorCode = res.status === 404 ? "NOT_FOUND" : "FETCH_FAILED";
            return NextResponse.json(
                { error: errorCode, message: `Failed to fetch page: ${res.statusText}` },
                { status: res.status }
            );
        }

        const html = await res.text();
        const pageUrl = inputUrl;

        // Extract title
        const title =
            pickFirstMatch(html, [
                /<h1[^>]*>([^<]+)<\/h1>/i,
                /<title>([^<]+)<\/title>/i,
            ]) || "PublicDomainVectors";

        // Try to find SVG download link
        // PDV typically has links like: /download-svg/filename.svg or direct .svg links
        let svgUrl: string | null = null;

        // Strategy 1: Look for download-svg links
        const downloadMatch = html.match(/href="([^"]*\/download-svg\/[^"]+\.svg[^"]*)"/i);
        if (downloadMatch && downloadMatch[1]) {
            svgUrl = downloadMatch[1];
        }

        // Strategy 2: Look for any .svg link in download area
        if (!svgUrl) {
            const svgMatch = html.match(/href="([^"]+\.svg)"/i);
            if (svgMatch && svgMatch[1]) {
                svgUrl = svgMatch[1];
            }
        }

        // Strategy 3: Look for data-src or src with .svg
        if (!svgUrl) {
            const imgMatch = html.match(/(?:data-src|src)="([^"]+\.svg)"/i);
            if (imgMatch && imgMatch[1]) {
                svgUrl = imgMatch[1];
            }
        }

        if (!svgUrl) {
            return NextResponse.json(
                {
                    error: "NO_SVG_LINK_FOUND",
                    message: "Could not find an SVG link on this PublicDomainVectors page. Try copying the direct SVG download link.",
                },
                { status: 404 }
            );
        }

        // Normalize relative URL to absolute
        if (!svgUrl.startsWith("http")) {
            const urlObj = new URL(pageUrl);
            svgUrl = new URL(svgUrl, urlObj.origin).toString();
        }

        // Validate SVG content
        try {
            const svgRes = await fetch(svgUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
            });

            if (svgRes.ok) {
                const svgText = await svgRes.text();
                if (!svgText.includes("<svg")) {
                    return NextResponse.json(
                        { error: "SVG_INVALID", message: "The resolved URL did not return valid SVG content." },
                        { status: 422 }
                    );
                }
            }
        } catch {
            // SVG validation failed, but we still have the URL - proceed
            console.warn("PDV SVG validation fetch failed, proceeding with URL only");
        }

        const result = {
            title: title.trim().replace(/\s+/g, " "),
            pageUrl,
            svgUrl,
            source: "publicdomainvectors",
        };

        cache.set(inputUrl, { data: result, timestamp: Date.now() });
        return NextResponse.json(result, { status: 200 });

    } catch (e: any) {
        console.error("PDV resolve failed:", e);
        return NextResponse.json(
            { error: "INTERNAL_ERROR", message: e?.message || "Resolve failed" },
            { status: 500 }
        );
    }
}
