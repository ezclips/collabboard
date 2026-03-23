export function extractYouTubeId(input: string): string | null {
  if (!input) return null;

  try {
    const normalized =
      input.startsWith("http://") || input.startsWith("https://")
        ? input
        : `https://${input}`;
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.replace("/", "").split("/")[0];
      return id || null;
    }

    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const fromQuery = parsed.searchParams.get("v");
      if (fromQuery) return fromQuery;

      const match = parsed.pathname.match(/\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})/i);
      if (match?.[2]) return match[2];
    }
  } catch {
    const match = input.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*?&)?v=|embed\/|shorts\/|live\/)|(?:i\.ytimg\.com|img\.youtube\.com)\/vi\/)([A-Za-z0-9_-]{11})/i
    );
    if (match?.[1]) return match[1];
  }

  return null;
}

export function buildYouTubeThumbCandidates(id: string): string[] {
  if (!id) return [];
  return [
    `https://i.ytimg.com/vi_webp/${id}/maxresdefault.webp`,
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi_webp/${id}/sddefault.webp`,
    `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
    `https://i.ytimg.com/vi_webp/${id}/hqdefault.webp`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  ];
}

