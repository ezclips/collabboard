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
    (typeNorm !== "" && titleNorm === typeNorm) ||
    (typeNorm !== "" && titleNorm === `new ${typeNorm}`) ||
    (typeNorm !== "" && titleNorm === `untitled ${typeNorm}`) ||
    (typeNorm === "table" && titleNorm === "image")
  );
};

export const getMeaningfulTitle = (title: unknown, type: unknown): string => {
  if (isPlaceholderTitle(title, type)) return "";
  return String(title).trim();
};
