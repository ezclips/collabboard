import { VERSIONS } from "@excalidraw/common";

import { t } from "../i18n";

import type { ExcalidrawProps, UIAppState } from "../types";

// PATCH-299. The fork's build bakes an env object without
// VITE_APP_LIBRARY_URL, so the bare lookup yielded the string "undefined" and
// resolved it relative to the host. Fall back to the real library site.
const DEFAULT_LIBRARY_URL = "https://libraries.excalidraw.com";

const LibraryMenuBrowseButton = ({
  theme,
  id,
  libraryReturnUrl,
}: {
  libraryReturnUrl: ExcalidrawProps["libraryReturnUrl"];
  theme: UIAppState["theme"];
  id: string;
}) => {
  const referrer =
    libraryReturnUrl || window.location.origin + window.location.pathname;
  const libraryUrl =
    import.meta.env.VITE_APP_LIBRARY_URL || DEFAULT_LIBRARY_URL;
  return (
    <a
      className="library-menu-browse-button"
      href={`${libraryUrl}?target=${
        window.name || "_blank"
      }&referrer=${referrer}&useHash=true&token=${id}&theme=${theme}&version=${
        VERSIONS.excalidrawLibrary
      }`}
      target="_excalidraw_libraries"
    >
      {t("labels.libraries")}
    </a>
  );
};

export default LibraryMenuBrowseButton;
