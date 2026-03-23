"use client";

import React from 'react';
import { CircleHelp, LassoSelect, Download } from 'lucide-react';
import "@excalidraw/excalidraw/index.css";

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
}: ExcalidrawWrapperProps) {
    // API kept in a ref to avoid triggering renders when Excalidraw fires the callback
    const apiRef = React.useRef<any>(null);
    const [excalidrawLib, setExcalidrawLib] = React.useState<{
        Excalidraw: React.ComponentType<any>;
        MainMenu: any;
        WelcomeScreen: any;
    } | null>(null);

    React.useEffect(() => {
        if (typeof window !== 'undefined' && !(window as any).EXCALIDRAW_ASSET_PATH) {
            (window as any).EXCALIDRAW_ASSET_PATH = "https://unpkg.com/@excalidraw/excalidraw/dist/";
        }
    }, []);

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
        excalidrawAPI?.(newApi);
    }, [excalidrawAPI]);

    const uiOptions = React.useMemo(() => ({
        canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
            saveAsImage: !readOnly,
        }
    }), [readOnly]);

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
                    <MainMenu.DefaultItems.LoadScene />
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
                <MainMenu.DefaultItems.LoadScene />
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
    }, [readOnly, onShowHelp, handleExportJSON, onGroupToggle, isGroupModeActive]);

    if (!excalidrawLib) {
        return (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Loading drawing editor...
            </div>
        );
    }

    const { Excalidraw, MainMenu, WelcomeScreen } = excalidrawLib;

    return (
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
        >
            {renderMenu(MainMenu)}
            <WelcomeScreen>
                <React.Fragment />
            </WelcomeScreen>
        </Excalidraw>
    );
}
