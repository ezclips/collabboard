"use client";

import React from "react";
import dynamic from "next/dynamic";
const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });
import {
  FacebookEmbed,
  InstagramEmbed,
  TikTokEmbed,
  TwitterEmbed,
} from "react-social-media-embed";

type EmbedKind =
  | "twitter"
  | "youtube"
  | "vimeo"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "video"
  | "none";

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".m3u8"];

const normalizeHost = (url: URL) => url.hostname.replace(/^www\./, "");

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
};

export default function LinkMediaEmbed({ url, forcedKind, disableInteraction = false }: LinkMediaEmbedProps) {
  if (typeof window === "undefined") return null;

  const normalizedUrl = normalizeUrl(url);
  const kind = forcedKind && forcedKind !== 'none' ? forcedKind : getLinkEmbedKind(normalizedUrl);
  if (kind === "none") return null;

  if (kind === "twitter") {
    return <TwitterEmbed url={normalizedUrl} width="100%" />;
  }

  if (kind === "youtube") {
    // Use ReactPlayer for YouTube - more reliable across different rendering contexts
    return (
      <div className={`relative w-full overflow-hidden bg-gray-100 ${disableInteraction ? "pointer-events-none" : ""}`}>
        <div className="pt-[56.25%]" />
        <div className="absolute inset-0">
          <ReactPlayer url={normalizedUrl} controls width="100%" height="100%" />
        </div>
      </div>
    );
  }

  if (kind === "vimeo") {
    // Ensure ReactPlayer handles Vimeo
    return (
      <div className={`relative w-full overflow-hidden bg-gray-100 ${disableInteraction ? "pointer-events-none" : ""}`}>
        <div className="pt-[56.25%]" />
        <div className="absolute inset-0">
          <ReactPlayer url={normalizedUrl} controls width="100%" height="100%" />
        </div>
      </div>
    );
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
