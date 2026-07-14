type DrawingEditTargetLabelPadlet = {
  title?: unknown;
  type?: unknown;
  metadata?: Record<string, unknown> | null;
};

const GENERIC_TITLES = new Set(["untitled"]);

const toText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const isMeaningfulTitle = (title: string) => {
  if (!title) return false;
  return !GENERIC_TITLES.has(title.toLowerCase());
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
  if (isMeaningfulTitle(title)) return title;
  return formatSemanticType(padlet.type ?? padlet.metadata?.kind);
};
