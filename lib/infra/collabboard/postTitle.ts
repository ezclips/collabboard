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
    // "New Post" (viewport-center add flow) and "New Note" (the Note
    // editor's own create-on-first-save flow, which stamps type "text"
    // with title "New Note" -- not "New Text") are generic default titles,
    // regardless of the post's actual type -- not just "new <type>".
    titleNorm === "new post" ||
    titleNorm === "new note" ||
    // "To-Do List" is the Todo editor's own create/save-time default
    // (usePadletSave's saveTodo), stamped on type "todo".
    titleNorm === "to-do list" ||
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
