export const isPlaceholderTitle = (title: unknown, type: unknown): boolean => {
  const titleNorm = String(title ?? "").trim().toLowerCase();
  const typeNorm = String(type ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return (
    titleNorm === "" ||
    titleNorm === "untitled" ||
    // "New Post" is the generic default title stamped by the shared
    // add-post-at-viewport-center flow, regardless of the post's actual
    // type -- not just "new <type>".
    titleNorm === "new post" ||
    (typeNorm !== "" && titleNorm === typeNorm) ||
    (typeNorm !== "" && titleNorm === `new ${typeNorm}`) ||
    (typeNorm !== "" && titleNorm === `untitled ${typeNorm}`) ||
    (typeNorm === "table" && titleNorm === "image") ||
    // "Comments" (plural) is the Comment post's own legacy default label.
    (typeNorm === "comment" && titleNorm === "comments")
  );
};

export const getMeaningfulTitle = (title: unknown, type: unknown): string => {
  if (isPlaceholderTitle(title, type)) return "";
  return String(title).trim();
};
