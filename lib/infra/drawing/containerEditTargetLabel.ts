import { isPlaceholderTitle } from "../collabboard/postTitle";

type DrawingEditTargetLabelPadlet = {
  title?: unknown;
  type?: unknown;
  metadata?: Record<string, unknown> | null;
};

const GENERIC_TITLES = new Set(["untitled"]);
const DISPLAY_METADATA_KEYS = ["caption", "linkTitle", "todoTitle", "title"] as const;

const toText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const isMeaningfulTitle = (title: string) => {
  if (!title) return false;
  return !GENERIC_TITLES.has(title.toLowerCase());
};

const getMetadataDisplayTitle = (metadata: Record<string, unknown> | null | undefined) => {
  for (const key of DISPLAY_METADATA_KEYS) {
    const value = toText(metadata?.[key]);
    if (isMeaningfulTitle(value)) return value;
  }
  return "";
};

const formatSemanticType = (value: unknown) => {
  const raw = toText(value) || "post";
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const getDrawingContainerEditTargetLabel = (
  padlet: DrawingEditTargetLabelPadlet,
) => {
  const title = toText(padlet.title);
  const semanticSource = padlet.type ?? padlet.metadata?.kind;
  if (isMeaningfulTitle(title) && !isPlaceholderTitle(title, semanticSource)) return title;
  const metadataTitle = getMetadataDisplayTitle(padlet.metadata);
  if (metadataTitle) return metadataTitle;
  return formatSemanticType(semanticSource);
};
