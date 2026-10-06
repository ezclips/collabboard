"use client";

import React from 'react';
import { CircleHelp, LassoSelect, Download, Upload } from 'lucide-react';
import "@excalidraw/excalidraw/index.css";
import {
    assertImportFileSize,
    parseImportedDrawingText,
    type ImportedDrawingScene,
} from '@/lib/infra/drawing/importScene';
import ExcalidrawCollabBoardContextMenu from '@/components/collabboard/menus/ExcalidrawCollabBoardContextMenu';
import AntvChartValuesControl from '@/components/collabboard/editors/AntvChartValuesControl';
import LibraryHoverPreview from '@/components/collabboard/editors/LibraryHoverPreview';
import LibraryToolbarButton from '@/components/collabboard/editors/LibraryToolbarButton';

import type { ExcalidrawContextMenuRendererProps } from "@excalidraw/excalidraw/types";

interface ExcalidrawWrapperProps {
    excalidrawKey: number;
    initialData: {
        elements: any[];
        appState: any;
        files: any;
        scrollToContent: boolean;
        libraryItems?: any[];
    };
    onChange: (elements: readonly any[], appState: any, files: any) => void;
    readOnly: boolean;
    onShowHelp: () => void;
    excalidrawAPI?: (api: any) => void;
    onGroupToggle?: () => void;
    isGroupModeActive?: boolean;
    validateEmbeddable?: boolean | string[] | RegExp | RegExp[] | ((link: string) => boolean | undefined);
    renderEmbeddable?: (element: any, appState: any) => React.ReactElement | null;
    onImportScene?: (scene: ImportedDrawingScene) => void | Promise<void>;
    /**
     * May this host still accept an imported scene, RIGHT NOW?
     *
     * Reading a file is asynchronous, and `onImportScene` is captured when the
     * read starts -- so a host that loses the right to edit while `file.text()`
     * is pending would still be handed the result. This is asked again on the
     * far side of that await, immediately before delivery, so a result that
     * arrives too late becomes inert.
     *
     * Optional, allow-by-default: a host with no such notion (the drawing-post
     * editor) is unchanged, and no board semantics are imposed on surfaces
     * that do not have them.
     */
    canImportScene?: () => boolean;
    /**
     * Opt in to rendering Excalidraw's own right-click menu on the shared
     * CollabBoard menu surface instead of Excalidraw's native one.
     *
     * Off by default so surfaces that share this wrapper (the drawing-post
     * editor) keep their current menu until they deliberately opt in. Purely a
     * presentation switch: Excalidraw still owns every menu action.
     */
    useCollabBoardContextMenu?: boolean;
    /** PATCH-291: 'toolbar' puts OUR library button beside the stock toolbar. */
    libraryButton?: 'toolbar' | 'default';
}

export default function ExcalidrawWrapper({
    excalidrawKey,
    initialData,
    onChange,
    readOnly,
    onShowHelp,
    excalidrawAPI,
    onGroupToggle,
    isGroupModeActive,
    validateEmbeddable,
    renderEmbeddable,
    onImportScene,
    canImportScene,
    useCollabBoardContextMenu = false,
    libraryButton = 'default',
}: ExcalidrawWrapperProps) {
    // API kept in a ref to avoid triggering renders when Excalidraw fires the callback
    const apiRef = React.useRef<any>(null);
    // PATCH-289. Root element the hover preview delegates its pointer events on.
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const importInputRef = React.useRef<HTMLInputElement | null>(null);
    // PATCH-287. Bumped when the Excalidraw API arrives, so the values panel can
    // subscribe once it exists.
    const [apiVersion, setApiVersion] = React.useState(0);
    const [excalidrawLib, setExcalidrawLib] = React.useState<{
        Excalidraw: React.ComponentType<any>;
        MainMenu: any;
        WelcomeScreen: any;
    } | null>(null);

    React.useEffect(() => {
        if (typeof window !== 'undefined' && !(window as any).EXCALIDRAW_ASSET_PATH) {
            (window as any).EXCALIDRAW_ASSET_PATH = `${window.location.origin}/excalidraw-assets/`;
        }
    }, []);

    const handleImportClick = React.useCallback(() => {
        importInputRef.current?.click();
    }, []);

    const handleImportChange = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !onImportScene) return;
        // Before the read even starts.
        if (canImportScene && !canImportScene()) return;

        try {
            assertImportFileSize(file.size);
            const text = await file.text();
            // The far side of the await. `file.text()` cannot be cancelled, so
            // the result is made inert instead: nothing is parsed and no
            // callback runs for a host that may no longer accept a scene.
            if (canImportScene && !canImportScene()) return;
            const scene = parseImportedDrawingText(text);
            // Asked once more immediately before delivery.
            if (canImportScene && !canImportScene()) return;
            await onImportScene(scene);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Import failed.";
            window.alert(message);
        }
    }, [onImportScene, canImportScene]);

    React.useEffect(() => {
        let mounted = true;
        import("@excalidraw/excalidraw").then((mod) => {
            if (!mounted) return;
            setExcalidrawLib({
                Excalidraw: mod.Excalidraw,
                MainMenu: mod.MainMenu,
                WelcomeScreen: mod.WelcomeScreen,
            });
        });
        return () => { mounted = false; };
    }, []);

    // Stable callback -- never changes reference, so Excalidraw won't re-render on prop change
    const handleSetApi = React.useCallback((newApi: any) => {
        if (apiRef.current === newApi) return;
        apiRef.current = newApi;
        setApiVersion((version) => version + 1);
        excalidrawAPI?.(newApi);
    }, [excalidrawAPI]);

    const getApi = React.useCallback(() => apiRef.current, []);

    const uiOptions = React.useMemo(() => ({
        canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            saveAsImage: !readOnly,
        }
    }), [readOnly]);

    // Stable reference: Excalidraw is memoized on a shallow prop compare, so an
    // inline arrow here would defeat that memoization on every wrapper render.
    const renderCollabBoardContextMenu = React.useCallback(
        (menuProps: ExcalidrawContextMenuRendererProps) => (
            <ExcalidrawCollabBoardContextMenu {...menuProps} />
        ),
        []
    );

    const resolvedValidateEmbeddable = React.useCallback((link: string) => {
        if (typeof link === "string" && link.startsWith("padlet://")) return true;
        if (typeof validateEmbeddable === "function") return validateEmbeddable(link);
        if (typeof validateEmbeddable === "boolean") return validateEmbeddable;
        if (Array.isArray(validateEmbeddable)) {
            return validateEmbeddable.some((entry) =>
                typeof entry === "string" ? entry === link : entry.test(link)
            );
        }
        if (validateEmbeddable instanceof RegExp) return validateEmbeddable.test(link);
        return undefined;
    }, [validateEmbeddable]);

    const handleExportJSON = React.useCallback(async () => {
        const api = apiRef.current;
        if (!api) return;
        const elements = api.getSceneElements();
        const appState = api.getAppState();
        const files = api.getFiles();

        const data = JSON.stringify({
            type: "excalidraw",
            version: 2,
            source: "https://excalidraw.com",
            elements,
            appState: {
                theme: appState.theme,
                viewBackgroundColor: appState.viewBackgroundColor,
            },
            files,
        }, null, 2);

        try {
            if ('showSaveFilePicker' in window) {
                const handle = await (window as any).showSaveFilePicker({
                    suggestedName: 'canvas.json',
                    types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(data);
                await writable.close();
            } else {
                const blob = new Blob([data], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = 'canvas.json';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 100);
            }
        } catch (err: any) {
            if (err?.name !== 'AbortError') console.error("Save failed:", err);
        }
    }, []);

    const renderMenu = React.useCallback((MainMenu: any) => {
        if (readOnly) {
            return (
                <MainMenu>
                    <MainMenu.Item onSelect={onShowHelp} icon={<CircleHelp size={16} />}>
                        Help
                    </MainMenu.Item>
                    <MainMenu.Item onSelect={handleExportJSON} icon={<Download size={16} />}>
                        Save to...
                    </MainMenu.Item>
                </MainMenu>
            );
        }

        if (onGroupToggle) {
            return (
                <MainMenu>
                    <MainMenu.Item onSelect={handleImportClick} icon={<Upload size={16} />}>
                        Import
                    </MainMenu.Item>
                    <MainMenu.Item onSelect={handleExportJSON} icon={<Download size={16} />}>
                        Save to...
                    </MainMenu.Item>
                    <MainMenu.DefaultItems.Help />
                    <MainMenu.Separator />
                    <MainMenu.Item
                        onSelect={onGroupToggle}
                        icon={<LassoSelect size={16} color={isGroupModeActive ? '#2563eb' : 'currentColor'} />}
                    >
                        {isGroupModeActive ? 'Cancel Grouping' : 'Group Posts'}
                    </MainMenu.Item>
                    <MainMenu.Separator />
                    <MainMenu.DefaultItems.ClearCanvas />
                    <MainMenu.DefaultItems.ToggleTheme />
                    <MainMenu.DefaultItems.ChangeCanvasBackground />
                </MainMenu>
            );
        }

        return (
            <MainMenu>
                <MainMenu.Item onSelect={handleImportClick} icon={<Upload size={16} />}>
                    Import
                </MainMenu.Item>
                <MainMenu.Item onSelect={handleExportJSON} icon={<Download size={16} />}>
                    Save to...
                </MainMenu.Item>
                <MainMenu.DefaultItems.Help />
                <MainMenu.DefaultItems.ClearCanvas />
                <MainMenu.Separator />
                <MainMenu.DefaultItems.ToggleTheme />
                <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
        );
    }, [readOnly, onShowHelp, handleExportJSON, handleImportClick, onGroupToggle, isGroupModeActive]);

    if (!excalidrawLib) {
        return (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Loading drawing editor...
            </div>
        );
    }

    const { Excalidraw, MainMenu, WelcomeScreen } = excalidrawLib;

    return (
        <div ref={rootRef} data-library-button={libraryButton} style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* PATCH-299: the Browse-libraries link is kept visible now that it
                opens the real library site; Excalidraw's own trigger is hidden
                only where our toolbar button replaces it. */}
            <style>{`
                ${libraryButton === 'toolbar' ? '[data-library-button="toolbar"] .default-sidebar-trigger { display: none; }' : ''}
            `}</style>
            <input
                ref={importInputRef}
                type="file"
                accept=".excalidraw,.json,application/json"
                className="hidden"
                onChange={handleImportChange}
            />
            <Excalidraw
                key={excalidrawKey}
                excalidrawAPI={handleSetApi}
                initialData={initialData}
                onChange={onChange}
                theme="light"
                viewModeEnabled={readOnly}
                aiEnabled={false}
                UIOptions={uiOptions}
                validateEmbeddable={resolvedValidateEmbeddable}
                renderEmbeddable={renderEmbeddable}
                customContextMenuRenderer={
                    useCollabBoardContextMenu ? renderCollabBoardContextMenu : undefined
                }
            >
                {renderMenu(MainMenu)}
                <WelcomeScreen>
                    <React.Fragment />
                </WelcomeScreen>
            </Excalidraw>
            {!readOnly ? (
                <AntvChartValuesControl getApi={getApi} apiVersion={apiVersion} />
            ) : null}
            {!readOnly && libraryButton === 'toolbar' ? (
                <LibraryToolbarButton
                    getApi={getApi}
                    rootRef={rootRef}
                    apiVersion={apiVersion}
                    readOnly={readOnly}
                />
            ) : null}
            <LibraryHoverPreview rootRef={rootRef} />
        </div>
    );
}
