/**
 * Decodes HTML entities like &lt; back to <
 * Handles SSR by using a pure string-based approach
 * Also handles double-encoding (&amp;lt; → &lt; → <)
 */
export function decodeHtmlEntities(text: string): string {
    if (!text) return "";

    let result = text;
    let previousResult = "";
    let iterations = 0;
    const maxIterations = 3; // Prevent infinite loops

    // Keep decoding until stable (handles double/triple encoding)
    while (result !== previousResult && iterations < maxIterations) {
        previousResult = result;
        iterations++;

        // Use pure string replacement for SSR compatibility
        result = result
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, " ");
    }

    return result;
}

/**
 * Detects if a string contains HTML (raw or entity-encoded)
 * 
 * IMPORTANT: We use a strict allowlist of known HTML tags to avoid
 * false positives from user text like "<3" or "a < b > c"
 */
export function looksLikeHtml(raw: string): boolean {
    if (!raw) return false;
    const s = raw.trim();

    // Allowlist of tags we actually generate from rich text editors
    // This prevents false positives from user input like "<3" or math expressions
    const knownTags = [
        'p', 'div', 'span', 'br', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li',
        'strong', 'b', 'em', 'i', 'u', 's', 'strike',
        'a', 'img', 'video', 'audio', 'iframe',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'blockquote', 'pre', 'code',
        'sup', 'sub', 'mark'
    ];

    // Check for known HTML tags (case insensitive)
    const tagPattern = new RegExp(`<\\/?(${knownTags.join('|')})(\\s|>|\\/)`, 'i');
    if (tagPattern.test(s)) return true;

    // Entity-encoded HTML (these are unambiguous)
    if (s.includes("&lt;") || s.includes("&gt;")) return true;
    if (s.includes("&amp;lt;")) return true; // Double-encoded

    return false;
}

/**
 * Safely convert any value to string
 */
export function asStringContent(v: unknown): string {
    if (typeof v === "string") return v;
    if (v == null) return "";
    try {
        return String(v);
    } catch {
        return "";
    }
}

/**
 * Normalize type to lowercase string
 */
export function normalizeType(t: unknown): string {
    return String(t ?? "").trim().toLowerCase();
}
