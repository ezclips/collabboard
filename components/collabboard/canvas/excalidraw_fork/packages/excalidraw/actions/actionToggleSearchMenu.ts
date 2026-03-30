import {
  KEYS,
  CANVAS_SEARCH_TAB,
  CLASSES,
  DEFAULT_SIDEBAR,
} from "@excalidraw/common";

import { CaptureUpdateAction } from "@excalidraw/element";

import { searchIcon } from "../components/icons";

import { register } from "./register";

import type { AppState } from "../types";

export const actionToggleSearchMenu = register({
  name: "searchMenu",
  icon: searchIcon,
  keywords: ["search", "find"],
  label: "search.title",
  viewMode: true,
  trackEvent: {
    category: "search_menu",
    action: "toggle",
    predicate: (appState) => appState.gridModeEnabled,
  },
  perform(elements, appState, _, app) {
    return false;
  },
  checked: (_appState: AppState) => false,
  predicate: () => false,
  keyTest: () => false,
});
