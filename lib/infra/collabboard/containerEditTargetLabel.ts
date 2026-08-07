import { isPlaceholderTitle } from "./postTitle";

type EditTargetLabelPadlet = {
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

// Label for a container child in any "which post do you want to edit?"
// picker (context menu submenus across Freeform/Drawing/Columns/Grid/Wall).
// A container can hold many same-typed children (ten notes, say) -- showing
// the bare type ("note") for all of them makes the picker useless, so this
// prefers the child's own title, then a few metadata fields that function as
// a title for certain types (caption/linkTitle/todoTitle), and only falls
// back to the formatted type name when none of those are set.
export const getContainerEditTargetLabel = (
  padlet: EditTargetLabelPadlet,
) => {
  const title = toText(padlet.title);
  const semanticSource = padlet.type ?? padlet.metadata?.kind;
  if (isMeaningfulTitle(title) && !isPlaceholderTitle(title, semanticSource)) return title;
  const metadataTitle = getMetadataDisplayTitle(padlet.metadata);
  if (metadataTitle) return metadataTitle;
  return formatSemanticType(semanticSource);
};
