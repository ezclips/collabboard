"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });
import {
  FacebookEmbed,
  InstagramEmbed,
  TikTokEmbed,
  TwitterEmbed,
} from "react-social-media-embed";
import { BoardSeekableVideo, seekAndPlay, type ReactPlayerInstance } from "./BoardSeekableVideo";
import {
  registerBoardVideoPlayer,
  takePendingBoardVideoSeek,
} from "./boardVideoPlayerRegistry";
import { buildYouTubeThumbCandidates, extractYouTubeId } from "@/lib/media/youtubeThumb";
import { mediaPostEmbedSource, mediaPostVideoIdentity } from "@/lib/domain/knowledge/mediaPostVideoIdentity";

type EmbedKind =
  | "twitter"
  | "youtube"
  | "vimeo"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "spotify"
  | "apple-podcasts"
  | "video"
  | "none";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".m3u8"];

const normalizeHost = (url: URL) => url.hostname.replace(/^www\./, "");

/**
 * PATCH-208. Ask the favicon service for a larger icon. The stored URL was
 * fetched at `sz=32` and shown at 10×10, which is blurry on any retina screen;
 * the card now renders it at 14×14, so it requests 64px. A URL without the
 * parameter gets it appended.
 */
export function sharpFavicon(url: string): string {
  if (!url) return url;
  if (/[?&]sz=\d+/i.test(url)) return url.replace(/([?&]sz=)\d+/i, "$164");
  return `${url}${url.includes("?") ? "&" : "?"}sz=64`;
}

const decodeHtmlEntities = (text: string) => {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, "gi"), char);
  }
  decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return decoded;
};

const normalizeUrl = (input: string) => {
  let url = decodeHtmlEntities(input).trim();
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1).trim();
  }
  if (url.startsWith("<") && url.endsWith(">")) {
    url = url.slice(1, -1).trim();
  }
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url)) {
    url = `https://${url}`;
  }
  return url;
};

export const getLinkEmbedKind = (url: string): EmbedKind => {
  const normalized = normalizeUrl(url);
  try {
    const parsed = new URL(normalized);
    const host = normalizeHost(parsed);

    if (host === "x.com" || host.endsWith("twitter.com")) return "twitter";
    if (host === "youtu.be" || host.endsWith("youtube.com")) return "youtube";
    if (host.endsWith("vimeo.com")) return "vimeo";
    if (host.endsWith("tiktok.com")) return "tiktok";
    if (host.endsWith("instagram.com")) return "instagram";
    if (host.endsWith("facebook.com") || host.endsWith("fb.watch")) return "facebook";

    // PATCH-205. Podcast players. The id/path extraction lives in the domain
    // module, so the transcript identity and the embed can never disagree about
    // which episode a link names. Exact-host matching there rejects a lookalike
    // like `open.spotify.com.evil.test`.
    const podcast = mediaPostEmbedSource(normalized);
    if (podcast !== null) return podcast.kind;

    const pathname = parsed.pathname.toLowerCase();
    if (VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return "video";

    return "none";
  } catch {
    const lower = normalized.toLowerCase();
    if (lower.includes("x.com") || lower.includes("twitter.com")) return "twitter";
    if (lower.includes("youtu.be") || lower.includes("youtube.com")) return "youtube";
    if (lower.includes("vimeo.com")) return "vimeo";
    if (lower.includes("tiktok.com")) return "tiktok";
    if (lower.includes("instagram.com")) return "instagram";
    if (lower.includes("facebook.com") || lower.includes("fb.watch")) return "facebook";
    if (VIDEO_EXTENSIONS.some((ext) => lower.includes(ext))) return "video";
    return "none";
  }
};

type LinkMediaEmbedProps = {
  url: string;
  forcedKind?: EmbedKind;
  disableInteraction?: boolean;
  /** PATCH-208. The card's preview image, shown on the facade before the player. */
  previewImage?: string;
  /** More URLs to try if `previewImage` fails, in order. */
  previewImageFallbacks?: readonly string[];
};

const PROVIDER_BADGE: Record<string, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  spotify: "Spotify",
  "apple-podcasts": "Apple Podcasts",
};

/** The podcast facade heights, matching each provider's real player. */
const PODCAST_FACADE_HEIGHT = { spotify: 152, appleEpisode: 175 } as const;

/** One fallback-chain image, the same onError logic the link cards use. */
function PreviewImage({
  src,
  fallbacks,
  className,
}: {
  src: string;
  fallbacks: readonly string[];
  className: string;
}) {
  return (
    <img
      src={src}
      alt=""
      className={className}
      loading="lazy"
      data-fallbacks={JSON.stringify(fallbacks)}
      onError={(event) => {
        const img = event.currentTarget;
        try {
          const queue = JSON.parse(img.dataset.fallbacks || "[]") as string[];
          const next = queue.shift();
          if (next) {
            img.dataset.fallbacks = JSON.stringify(queue);
            img.src = next;
            return;
          }
        } catch {
          // ignore
        }
        // Never a broken-image icon: hide the img so the dark tile shows.
        img.style.display = "none";
      }}
    />
  );
}

/** The centred round play button. A real <button>, so Enter/Space work. */
function PlayButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      aria-label="Play"
      onClick={onClick}
      disabled={disabled}
      className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/75 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black/30"
    >
      <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
    </button>
  );
}

function ProviderBadge({ kind }: { kind: string }) {
  return (
    <span className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white">
      {PROVIDER_BADGE[kind] ?? kind}
    </span>
  );
}

/**
 * PATCH-208. The thumbnail-and-play-button a media card shows BEFORE any player
 * is mounted. The provider's full player used to load the moment the card
 * appeared: at card width YouTube's own chrome filled it (title bar, avatar,
 * share icons, "Watch on YouTube") and every board open loaded a player per
 * card. The facade keeps the provider's player off the page until the person
 * asks for it.
 *
 * IT ALSO HOLDS THE TRANSCRIPT SEEK. A citation seeks a MOUNTED player through
 * `boardVideoPlayerRegistry`; with only a facade mounted there is none. So the
 * facade registers UNDER THE SAME IDENTITY: a seek activates it, and the seek is
 * applied when the player reports ready (see `pendingSecondsRef`).
 */
function MediaFacade({
  kind,
  url,
  previewImage,
  previewImageFallbacks = [],
  disableInteraction,
}: {
  kind: EmbedKind;
  url: string;
  previewImage?: string;
  previewImageFallbacks?: readonly string[];
  disableInteraction: boolean;
}) {
  const [activated, setActivated] = useState(false);
  const pendingSecondsRef = useRef<number | null>(null);
  const playerRef = useRef<ReactPlayerInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const unregisterRef = useRef<(() => void) | null>(null);

  // Only a canonical identity can be registered, exactly as BoardSeekableVideo
  // does it: a URL-shaped fallback could never match a stored transcript.
  const identity = (() => {
    const resolved = mediaPostVideoIdentity(url);
    return resolved !== null && resolved.canonical ? resolved.identity : null;
  })();

  const activate = useCallback((seconds: number | null) => {
    if (seconds !== null) pendingSecondsRef.current = seconds;
    if (playerRef.current && pendingSecondsRef.current !== null) {
      // Already mounted: seek now rather than mounting again.
      seekAndPlay(playerRef.current, pendingSecondsRef.current);
      pendingSecondsRef.current = null;
      return;
    }
    setActivated(true);
  }, []);

  useEffect(() => {
    if (identity === null) return;
    unregisterRef.current = registerBoardVideoPlayer(identity, {
      seekTo: (seconds) => activate(seconds),
      reveal: () => {
        containerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      },
    });
    // PATCH-208 FIX. A seek that arrived a moment before this instance mounted
    // (the citation was clicked as the card was re-keyed) is adopted here, so
    // the moment is not lost with the instance that first received it.
    const pending = takePendingBoardVideoSeek(identity);
    if (pending !== null) activate(pending);
    return () => {
      unregisterRef.current?.();
      unregisterRef.current = null;
    };
  }, [identity, activate]);

  const handlePlayerReady = useCallback((player: ReactPlayerInstance) => {
    playerRef.current = player;
    if (pendingSecondsRef.current !== null) {
      seekAndPlay(player, pendingSecondsRef.current);
      pendingSecondsRef.current = null;
    }
  }, []);

  const inert = disableInteraction ? "pointer-events-none" : "";
  const badge = <ProviderBadge kind={kind} />;

  if (activated) {
    if (kind === "youtube" || kind === "vimeo") {
      return (
        <div ref={containerRef} className={inert}>
          <BoardSeekableVideo
            url={url}
            disableInteraction={disableInteraction}
            autoPlay
            onPlayerReady={handlePlayerReady}
            registerSelf={false}
          />
        </div>
      );
    }
    // spotify / apple-podcasts: the provider iframe, autoplaying where allowed.
    const embed = mediaPostEmbedSource(url);
    if (embed === null) return null;
    const height = embed.kind === "spotify" ? 152 : embed.isShow ? 450 : 175;
    return (
      <div className={inert}>
        <iframe
          src={`${embed.src}${embed.src.includes("?") ? "&" : "?"}autoplay=1`}
          width="100%"
          height={height}
          style={{ border: 0 }}
          className="rounded-md"
          title={
            embed.kind === "spotify"
              ? embed.isShow ? "Spotify show player" : "Spotify episode player"
              : "Apple Podcasts player"
          }
          allow={
            embed.kind === "spotify"
              ? "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              : "autoplay *; encrypted-media *; clipboard-write"
          }
          sandbox={
            embed.kind === "apple-podcasts"
              ? "allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
              : undefined
          }
        />
      </div>
    );
  }

  const hasImage = typeof previewImage === "string" && previewImage.length > 0;

  // YouTube's own thumbnail chain, derived from the URL when the caller did not
  // pass one. The callers do pass their computed chain, but the embed must not
  // fall back to a dark tile for a video whose poster it can name itself.
  const youtubePoster = (() => {
    if (hasImage || kind !== "youtube") return { src: "", fallbacks: [] as string[] };
    const id = extractYouTubeId(url);
    const candidates = id ? buildYouTubeThumbCandidates(id) : [];
    return { src: candidates[0] ?? "", fallbacks: candidates.slice(1) };
  })();
  const posterSrc = hasImage ? previewImage! : youtubePoster.src;
  const posterFallbacks = hasImage ? previewImageFallbacks : youtubePoster.fallbacks;
  const poster = posterSrc.length > 0;

  // Podcast art is SQUARE, so it is a 1:1 cover beside the badge on a dark tile
  // of the player's own height -- not a stretched 16:9 like a video thumbnail.
  if (kind === "spotify" || kind === "apple-podcasts") {
    const height = kind === "spotify" ? PODCAST_FACADE_HEIGHT.spotify : PODCAST_FACADE_HEIGHT.appleEpisode;
    return (
      <div ref={containerRef} className={`relative w-full rounded-md bg-gray-900 ${inert}`} style={{ height }}>
        {poster ? (
          <div className="flex h-full items-center justify-center overflow-hidden p-3">
            <PreviewImage
              src={posterSrc}
              fallbacks={posterFallbacks}
              className="h-full max-h-[120px] w-auto rounded object-cover"
            />
          </div>
        ) : null}
        <PlayButton onClick={() => activate(null)} disabled={disableInteraction} />
        {badge}
      </div>
    );
  }

  // YouTube / Vimeo: a 16:9 thumbnail.
  return (
    <div ref={containerRef} className={`relative w-full overflow-hidden rounded-md bg-gray-900 ${inert}`}>
      <div className="pt-[56.25%]" />
      <div className="absolute inset-0">
        {poster ? (
          <PreviewImage
            src={posterSrc}
            fallbacks={posterFallbacks}
            className="h-full w-full object-cover"
          />
        ) : null}
        <PlayButton onClick={() => activate(null)} disabled={disableInteraction} />
        {badge}
      </div>
    </div>
  );
}

export default function LinkMediaEmbed({
  url,
  forcedKind,
  disableInteraction = false,
  previewImage,
  previewImageFallbacks,
}: LinkMediaEmbedProps) {
  if (typeof window === "undefined") return null;

  const normalizedUrl = normalizeUrl(url);
  const kind = forcedKind && forcedKind !== 'none' ? forcedKind : getLinkEmbedKind(normalizedUrl);
  if (kind === "none") return null;

  if (
    kind === "youtube"
    || kind === "vimeo"
    || kind === "spotify"
    || kind === "apple-podcasts"
  ) {
    return (
      <MediaFacade
        kind={kind}
        url={normalizedUrl}
        previewImage={previewImage}
        previewImageFallbacks={previewImageFallbacks}
        disableInteraction={disableInteraction}
      />
    );
  }

  if (kind === "twitter") {
    return <TwitterEmbed url={normalizedUrl} width="100%" />;
  }

  if (kind === "tiktok") {
    return <div className={disableInteraction ? "pointer-events-none" : ""}><TikTokEmbed url={normalizedUrl} width="100%" /></div>;
  }

  if (kind === "instagram") {
    return <div className={disableInteraction ? "pointer-events-none" : ""}><InstagramEmbed url={normalizedUrl} width="100%" /></div>;
  }

  if (kind === "facebook") {
    return <div className={disableInteraction ? "pointer-events-none" : ""}><FacebookEmbed url={normalizedUrl} width="100%" /></div>;
  }

  return (
    <div className={`relative w-full overflow-hidden bg-gray-100 ${disableInteraction ? "pointer-events-none" : ""}`}>
      <div className="pt-[56.25%]" />
      <div className="absolute inset-0">
        <ReactPlayer url={normalizedUrl} controls width="100%" height="100%" />
      </div>
    </div>
  );
}
