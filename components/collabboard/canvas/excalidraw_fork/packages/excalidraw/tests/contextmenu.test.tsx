import React from "react";
import { vi } from "vitest";

import { KEYS, reseed } from "@excalidraw/common";

import { setDateTimeForTests } from "@excalidraw/common";

import { copiedStyles } from "../actions/actionStyles";
import { Excalidraw } from "../index";
import * as StaticScene from "../renderer/staticScene";

import { API } from "./helpers/api";
import { UI, Pointer, Keyboard } from "./helpers/ui";
import {
  act,
  render,
  fireEvent,
  mockBoundingClientRect,
  restoreOriginalGetBoundingClientRect,
  GlobalTestState,
  screen,
  queryByText,
  queryAllByText,
  waitFor,
  togglePopover,
  unmountComponent,
  checkpointHistory,
} from "./test-utils";

import type { ShortcutName } from "../actions/shortcuts";
import type { ActionName } from "../actions/types";

const checkpoint = (name: string) => {
  expect(renderStaticScene.mock.calls.length).toMatchSnapshot(
    `[${name}] number of renders`,
  );
  expect(h.state).toMatchSnapshot(`[${name}] appState`);
  expect(h.elements.length).toMatchSnapshot(`[${name}] number of elements`);
  h.elements.forEach((element, i) =>
    expect(element).toMatchSnapshot(`[${name}] element ${i}`),
  );

  checkpointHistory(h.history, name);
};

const mouse = new Pointer("mouse");

unmountComponent();

const renderStaticScene = vi.spyOn(StaticScene, "renderStaticScene");
beforeEach(() => {
  localStorage.clear();
  renderStaticScene.mockClear();
  reseed(7);
});

const { h } = window;

describe("contextMenu element", () => {
  beforeEach(async () => {
    localStorage.clear();
    renderStaticScene.mockClear();
    reseed(7);
    setDateTimeForTests("201933152653");

    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  beforeAll(() => {
    mockBoundingClientRect();
  });

  afterAll(() => {
    restoreOriginalGetBoundingClientRect();
  });

  afterEach(() => {
    checkpoint("end of test");

    mouse.reset();
    mouse.down(0, 0);
  });

  it("shows context menu for canvas", () => {
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 1,
      clientY: 1,
    });
    const contextMenu = UI.queryContextMenu();
    const contextMenuOptions =
      contextMenu?.querySelectorAll(".context-menu li");
    const expectedShortcutNames: ShortcutName[] = [
      "paste",
      "selectAll",
      "gridMode",
      "zenMode",
      "viewMode",
      "objectsSnapMode",
      "stats",
    ];

    expect(contextMenu).not.toBeNull();
    expect(contextMenuOptions?.length).toBe(expectedShortcutNames.length);
    expectedShortcutNames.forEach((shortcutName) => {
      expect(
        contextMenu?.querySelector(`li[data-testid="${shortcutName}"]`),
      ).not.toBeNull();
    });
  });

  it("shows context menu for element", () => {
    UI.clickTool("rectangle");
    mouse.down(0, 0);
    mouse.up(10, 10);

    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 3,
      clientY: 3,
    });
    const contextMenu = UI.queryContextMenu();
    const contextMenuOptions =
      contextMenu?.querySelectorAll(".context-menu li");
    const expectedContextMenuItems: ActionName[] = [
      "cut",
      "copy",
      "paste",
      "wrapSelectionInFrame",
      "copyStyles",
      "pasteStyles",
      "deleteSelectedElements",
      "addToLibrary",
      "flipHorizontal",
      "flipVertical",
      "sendBackward",
      "bringForward",
      "sendToBack",
      "bringToFront",
      "duplicateSelection",
      "hyperlink",
      "copyElementLink",
      "toggleElementLock",
    ];

    expect(contextMenu).not.toBeNull();
    expect(contextMenuOptions?.length).toBe(expectedContextMenuItems.length);
    expectedContextMenuItems.forEach((item) => {
      expect(
        contextMenu?.querySelector(`li[data-testid="${item}"]`),
      ).not.toBeNull();
    });
  });

  it("shows context menu for element", () => {
    const rect1 = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      height: 200,
      width: 200,
      backgroundColor: "red",
    });
    const rect2 = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      height: 200,
      width: 200,
      backgroundColor: "red",
    });
    API.setElements([rect1, rect2]);
    API.setSelectedElements([rect1]);

    // lower z-index
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 100,
      clientY: 100,
    });
    expect(UI.queryContextMenu()).not.toBeNull();
    expect(API.getSelectedElement().id).toBe(rect1.id);

    // higher z-index
    API.setSelectedElements([rect2]);
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 100,
      clientY: 100,
    });
    expect(UI.queryContextMenu()).not.toBeNull();
    expect(API.getSelectedElement().id).toBe(rect2.id);
  });

  it("shows 'Group selection' in context menu for multiple selected elements", () => {
    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(10, 10);

    UI.clickTool("rectangle");
    mouse.down(12, -10);
    mouse.up(10, 10);

    mouse.reset();
    mouse.click(10, 10);
    Keyboard.withModifierKeys({ shift: true }, () => {
      mouse.click(22, 0);
    });

    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 3,
      clientY: 3,
    });

    const contextMenu = UI.queryContextMenu();
    const contextMenuOptions =
      contextMenu?.querySelectorAll(".context-menu li");
    const expectedShortcutNames: ShortcutName[] = [
      "cut",
      "copy",
      "paste",
      "wrapSelectionInFrame",
      "copyStyles",
      "pasteStyles",
      "deleteSelectedElements",
      "group",
      "addToLibrary",
      "flipHorizontal",
      "flipVertical",
      "sendBackward",
      "bringForward",
      "sendToBack",
      "bringToFront",
      "duplicateSelection",
      "toggleElementLock",
    ];

    expect(contextMenu).not.toBeNull();
    expect(contextMenuOptions?.length).toBe(expectedShortcutNames.length);
    expectedShortcutNames.forEach((shortcutName) => {
      expect(
        contextMenu?.querySelector(`li[data-testid="${shortcutName}"]`),
      ).not.toBeNull();
    });
  });

  it("shows 'Ungroup selection' in context menu for group inside selected elements", () => {
    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(10, 10);

    UI.clickTool("rectangle");
    mouse.down(12, -10);
    mouse.up(10, 10);

    mouse.reset();
    mouse.click(10, 10);
    Keyboard.withModifierKeys({ shift: true }, () => {
      mouse.click(22, 0);
    });

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.keyPress(KEYS.G);
    });

    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 3,
      clientY: 3,
    });

    const contextMenu = UI.queryContextMenu();
    const contextMenuOptions =
      contextMenu?.querySelectorAll(".context-menu li");
    const expectedContextMenuItems: ActionName[] = [
      "cut",
      "copy",
      "paste",
      "wrapSelectionInFrame",
      "copyStyles",
      "pasteStyles",
      "deleteSelectedElements",
      "copyElementLink",
      "ungroup",
      "addToLibrary",
      "flipHorizontal",
      "flipVertical",
      "sendBackward",
      "bringForward",
      "sendToBack",
      "bringToFront",
      "duplicateSelection",
      "toggleElementLock",
    ];

    expect(contextMenu).not.toBeNull();
    expect(contextMenuOptions?.length).toBe(expectedContextMenuItems.length);
    expectedContextMenuItems.forEach((item) => {
      expect(
        contextMenu?.querySelector(`li[data-testid="${item}"]`),
      ).not.toBeNull();
    });
  });

  it("selecting 'Copy styles' in context menu copies styles", () => {
    UI.clickTool("rectangle");
    mouse.down(0, 0);
    mouse.up(10, 10);

    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 3,
      clientY: 3,
    });
    const contextMenu = UI.queryContextMenu();
    expect(copiedStyles).toBe("{}");
    fireEvent.click(queryByText(contextMenu!, "Copy styles")!);
    expect(copiedStyles).not.toBe("{}");
    const element = JSON.parse(copiedStyles)[0];
    expect(element).toEqual(API.getSelectedElement());
  });

  it("selecting 'Paste styles' in context menu pastes styles", () => {
    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    // Change some styles of second rectangle
    togglePopover("Stroke");
    UI.clickOnTestId("color-red");
    togglePopover("Background");
    UI.clickOnTestId("color-blue");
    // Fill style
    fireEvent.click(screen.getByTitle("Cross-hatch"));
    // Stroke width
    fireEvent.click(screen.getByTitle("Bold"));
    // Stroke style
    fireEvent.click(screen.getByTitle("Dotted"));
    // Roughness
    fireEvent.click(screen.getByTitle("Cartoonist"));
    // Opacity
    fireEvent.change(screen.getByTestId("opacity"), {
      target: { value: "60" },
    });

    // closing the background popover as this blocks
    // context menu from rendering after we started focussing
    // the popover once rendered :/
    togglePopover("Background");

    mouse.reset();

    // Copy styles of second rectangle
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 40,
      clientY: 40,
    });

    let contextMenu = UI.queryContextMenu();
    fireEvent.click(queryByText(contextMenu!, "Copy styles")!);
    const secondRect = JSON.parse(copiedStyles)[0];
    expect(secondRect.id).toBe(h.elements[1].id);

    mouse.reset();
    // Paste styles to first rectangle
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 10,
      clientY: 10,
    });
    contextMenu = UI.queryContextMenu();
    fireEvent.click(queryByText(contextMenu!, "Paste styles")!);

    const firstRect = API.getSelectedElement();
    expect(firstRect.id).toBe(h.elements[0].id);
    expect(firstRect.strokeColor).toBe("#e03131");
    expect(firstRect.backgroundColor).toBe("#a5d8ff");
    expect(firstRect.fillStyle).toBe("cross-hatch");
    expect(firstRect.strokeWidth).toBe(2); // Bold: 2
    expect(firstRect.strokeStyle).toBe("dotted");
    expect(firstRect.roughness).toBe(2); // Cartoonist: 2
    expect(firstRect.opacity).toBe(60);
  });

  it("selecting 'Delete' in context menu deletes element", () => {
    UI.clickTool("rectangle");
    mouse.down(0, 0);
    mouse.up(10, 10);

    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 3,
      clientY: 3,
    });
    const contextMenu = UI.queryContextMenu();
    fireEvent.click(queryAllByText(contextMenu!, "Delete")[0]);
    expect(API.getSelectedElements()).toHaveLength(0);
    expect(h.elements[0].isDeleted).toBe(true);
  });

  it("selecting 'Add to library' in context menu adds element to library", async () => {
    UI.clickTool("rectangle");
    mouse.down(0, 0);
    mouse.up(10, 10);

    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 3,
      clientY: 3,
    });
    const contextMenu = UI.queryContextMenu();
    fireEvent.click(queryByText(contextMenu!, "Add to library")!);

    await waitFor(async () => {
      const libraryItems = await h.app.library.getLatestLibrary();
      expect(libraryItems[0].elements[0]).toEqual(h.elements[0]);
    });
  });

  it("selecting 'Duplicate' in context menu duplicates element", () => {
    UI.clickTool("rectangle");
    mouse.down(0, 0);
    mouse.up(10, 10);

    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 3,
      clientY: 3,
    });
    const contextMenu = UI.queryContextMenu();
    fireEvent.click(queryByText(contextMenu!, "Duplicate")!);
    expect(h.elements).toHaveLength(2);
    const {
      id: _id0,
      seed: _seed0,
      x: _x0,
      y: _y0,
      index: _fractionalIndex0,
      version: _version0,
      versionNonce: _versionNonce0,
      ...rect1
    } = h.elements[0];
    const {
      id: _id1,
      seed: _seed1,
      x: _x1,
      y: _y1,
      index: _fractionalIndex1,
      version: _version1,
      versionNonce: _versionNonce1,
      ...rect2
    } = h.elements[1];
    expect(rect1).toEqual(rect2);
  });

  it("selecting 'Send backward' in context menu sends element backward", () => {
    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    mouse.reset();
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 40,
      clientY: 40,
    });
    const contextMenu = UI.queryContextMenu();
    const elementsBefore = h.elements;
    fireEvent.click(queryByText(contextMenu!, "Send backward")!);
    expect(elementsBefore[0].id).toEqual(h.elements[1].id);
    expect(elementsBefore[1].id).toEqual(h.elements[0].id);
  });

  it("selecting 'Bring forward' in context menu brings element forward", () => {
    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    mouse.reset();
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 10,
      clientY: 10,
    });
    const contextMenu = UI.queryContextMenu();
    const elementsBefore = h.elements;
    fireEvent.click(queryByText(contextMenu!, "Bring forward")!);
    expect(elementsBefore[0].id).toEqual(h.elements[1].id);
    expect(elementsBefore[1].id).toEqual(h.elements[0].id);
  });

  it("selecting 'Send to back' in context menu sends element to back", () => {
    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    mouse.reset();
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 40,
      clientY: 40,
    });
    const contextMenu = UI.queryContextMenu();
    const elementsBefore = h.elements;
    fireEvent.click(queryByText(contextMenu!, "Send to back")!);
    expect(elementsBefore[1].id).toEqual(h.elements[0].id);
  });

  it("selecting 'Bring to front' in context menu brings element to front", () => {
    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    mouse.reset();
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 10,
      clientY: 10,
    });
    const contextMenu = UI.queryContextMenu();
    const elementsBefore = h.elements;
    fireEvent.click(queryByText(contextMenu!, "Bring to front")!);
    expect(elementsBefore[0].id).toEqual(h.elements[1].id);
  });

  it("selecting 'Group selection' in context menu groups selected elements", () => {
    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    mouse.reset();
    Keyboard.withModifierKeys({ shift: true }, () => {
      mouse.click(10, 10);
    });

    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 3,
      clientY: 3,
    });
    const contextMenu = UI.queryContextMenu();
    fireEvent.click(queryByText(contextMenu!, "Group selection")!);
    const selectedGroupIds = Object.keys(h.state.selectedGroupIds);
    expect(h.elements[0].groupIds).toEqual(selectedGroupIds);
    expect(h.elements[1].groupIds).toEqual(selectedGroupIds);
  });

  it("selecting 'Ungroup selection' in context menu ungroups selected group", () => {
    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    mouse.reset();
    Keyboard.withModifierKeys({ shift: true }, () => {
      mouse.click(10, 10);
    });

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.keyPress(KEYS.G);
    });

    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: 3,
      clientY: 3,
    });

    const contextMenu = UI.queryContextMenu();
    expect(contextMenu).not.toBeNull();
    fireEvent.click(queryByText(contextMenu!, "Ungroup selection")!);

    const selectedGroupIds = Object.keys(h.state.selectedGroupIds);
    expect(selectedGroupIds).toHaveLength(0);
    expect(h.elements[0].groupIds).toHaveLength(0);
    expect(h.elements[1].groupIds).toHaveLength(0);
  });

  it("right-clicking on a group should select whole group", () => {
    const rectangle1 = API.createElement({
      type: "rectangle",
      width: 100,
      backgroundColor: "red",
      fillStyle: "solid",
      groupIds: ["g1"],
    });
    const rectangle2 = API.createElement({
      type: "rectangle",
      width: 100,
      backgroundColor: "red",
      fillStyle: "solid",
      groupIds: ["g1"],
    });
    API.setElements([rectangle1, rectangle2]);

    mouse.rightClickAt(50, 50);
    expect(API.getSelectedElements().length).toBe(2);
    expect(API.getSelectedElements()).toEqual([
      expect.objectContaining({ id: rectangle1.id }),
      expect.objectContaining({ id: rectangle2.id }),
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// PATCH 6A foundation: the optional customContextMenuRenderer hook.
//
// These render for real, so they cover what the root-side resolver unit tests
// cannot: that the native menu is still what renders by default, that
// right-click selection happens before presentation, and that an opted-in
// custom renderer receives exactly the menu Excalidraw itself would have shown.
//
// No production consumer supplies this prop; only these tests do.
// ─────────────────────────────────────────────────────────────────────────
describe("contextMenu custom renderer (PATCH 6A foundation)", () => {
  beforeEach(async () => {
    localStorage.clear();
    renderStaticScene.mockClear();
    reseed(7);
    setDateTimeForTests("201933152653");
  });

  beforeAll(() => {
    mockBoundingClientRect();
  });

  afterAll(() => {
    restoreOriginalGetBoundingClientRect();
  });

  /** Labels of the natively rendered menu, in DOM order. */
  const nativeMenuLabels = () => {
    const menu = UI.queryContextMenu();
    return Array.from(menu?.querySelectorAll(".context-menu li") ?? []).map(
      (li) =>
        li.querySelector(".context-menu-item__label")?.textContent?.trim() ?? "",
    );
  };

  const rightClickCanvas = (x = 1, y = 1) => {
    fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
      button: 2,
      clientX: x,
      clientY: y,
    });
  };

  it("renders the native menu when no custom renderer is supplied", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    rightClickCanvas();
    expect(UI.queryContextMenu()).not.toBeNull();
    expect(nativeMenuLabels().length).toBeGreaterThan(0);
  });

  it("keeps displaying its own shortcut hints while the native menu is active", async () => {
    // 4H's no-shortcut rule applies to CollabBoard menus; native Excalidraw is
    // unchanged until 6B replaces the surface.
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    rightClickCanvas();
    const menu = UI.queryContextMenu();
    const shortcuts = menu?.querySelectorAll(".context-menu-item__shortcut");
    expect(shortcuts?.length).toBeGreaterThan(0);
  });

  it("marks Delete dangerous and a toggled action checked, natively", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    UI.clickTool("rectangle");
    mouse.down(0, 0);
    mouse.up(10, 10);
    mouse.rightClickAt(5, 5);

    const menu = UI.queryContextMenu();
    const del = menu?.querySelector('li[data-testid="deleteSelectedElements"]');
    expect(del?.querySelector("button")?.className).toContain("dangerous");
    // Nothing else is destructive.
    expect(menu?.querySelectorAll("button.dangerous")?.length).toBe(1);
  });

  it("reflects a checked action's state in the native menu", async () => {
    // Toggled through the menu itself: passing gridModeEnabled as a prop makes
    // the host own grid mode and removes the item from the menu entirely.
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    rightClickCanvas();
    const snapItem = () =>
      UI.queryContextMenu()?.querySelector(
        'li[data-testid="objectsSnapMode"] button',
      );
    expect(snapItem()?.className).not.toContain("checkmark");

    act(() => {
      fireEvent.click(
        UI.queryContextMenu()!.querySelector('li[data-testid="objectsSnapMode"]')!,
      );
    });

    rightClickCanvas();
    expect(snapItem()?.className).toContain("checkmark");
  });

  it("shows the read-only inventory in view mode, natively", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} viewModeEnabled />);
    rightClickCanvas();
    const items = Array.from(
      UI.queryContextMenu()?.querySelectorAll(".context-menu li") ?? [],
    ).map((li) => li.getAttribute("data-testid"));
    // View mode drops editing actions such as paste and selectAll.
    expect(items).not.toContain("paste");
    expect(items).not.toContain("selectAll");
    expect(items).toContain("gridMode");
    expect(items).toContain("zenMode");
    expect(items).toContain("stats");
  });

  it("hands the custom renderer the same menu, and suppresses the native surface", async () => {
    const seen: any[] = [];
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        customContextMenuRenderer={(props) => {
          seen.push(props);
          return null;
        }}
      />,
    );
    rightClickCanvas(7, 9);

    // Native presentation must not also render.
    expect(UI.queryContextMenu()).toBeNull();
    expect(seen.length).toBeGreaterThan(0);

    const last = seen[seen.length - 1];
    expect(last.items.length).toBeGreaterThan(0);
    // Labels are display-ready, not translation keys.
    const labels = last.items
      .filter((i: any) => i.type === "item")
      .map((i: any) => i.label);
    expect(labels.every((l: string) => l.length > 0)).toBe(true);
    expect(labels.some((l: string) => l.includes("."))).toBe(false);
    // Descriptors carry presentation only: no action identity, no shortcut.
    for (const item of last.items) {
      expect(item).not.toHaveProperty("name");
      expect(item).not.toHaveProperty("shortcut");
      expect(item).not.toHaveProperty("predicate");
    }
    // Viewport coordinates derived from the right-click.
    expect(typeof last.x).toBe("number");
    expect(typeof last.y).toBe("number");
  });

  it("gives the custom renderer the same item order the native menu shows", async () => {
    // Native pass.
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    rightClickCanvas();
    const native = nativeMenuLabels();
    expect(native.length).toBeGreaterThan(0);

    // Custom pass, same state.
    reseed(7);
    const seen: any[] = [];
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        customContextMenuRenderer={(props) => {
          seen.push(props);
          return null;
        }}
      />,
    );
    rightClickCanvas();
    const custom = seen[seen.length - 1].items
      .filter((i: any) => i.type === "item")
      .map((i: any) => i.label);

    expect(custom).toEqual(native);
  });

  it("executes through the existing action path and closes via the native lifecycle", async () => {
    const seen: any[] = [];
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        customContextMenuRenderer={(props) => {
          seen.push(props);
          return null;
        }}
      />,
    );
    UI.clickTool("rectangle");
    mouse.down(0, 0);
    mouse.up(10, 10);
    mouse.rightClickAt(5, 5);

    // Right-click selection happened before presentation reached the renderer.
    expect(API.getSelectedElements().length).toBe(1);

    const items = seen[seen.length - 1].items;
    const deleteIdx = items.findIndex((i: any) => i.dangerous);
    expect(deleteIdx).toBeGreaterThan(-1);

    act(() => {
      items[deleteIdx].onSelect();
    });

    // The real action ran, and Excalidraw's own menu state was cleared.
    expect(API.getSelectedElements().length).toBe(0);
    expect(h.state.contextMenu).toBeNull();
  });

  it("closes Excalidraw's menu state when the renderer calls onClose", async () => {
    const seen: any[] = [];
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        customContextMenuRenderer={(props) => {
          seen.push(props);
          return null;
        }}
      />,
    );
    rightClickCanvas();
    expect(h.state.contextMenu).not.toBeNull();

    act(() => {
      seen[seen.length - 1].onClose();
    });
    expect(h.state.contextMenu).toBeNull();
  });
});
