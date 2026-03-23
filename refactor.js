const fs = require('fs');
const path = require('path');
const file = path.join('c:', 'Users', 'rmeic', 'Projects', 'dev', 'starter', 'components', 'collabboard', 'canvas', 'layouts', 'DrawingLayout.tsx');
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/import \{\r?\n  DndContext,[\s\S]*?\} from '@dnd-kit\/core';\r?\n/g, '');
code = code.replace(/function DraggablePadlet\(\{[\s\S]*?function DraggableCommentPin\(\{[\s\S]*?\}\r?\n\r?\ninterface DrawingLayoutProps/g, 'interface DrawingLayoutProps');
code = code.replace(/  \/\/ Lasso and selection state[\s\S]*?const pointInPolygon = useCallback[\s\S]*?const getRenderedPadletRect = useCallback[\s\S]*?\}, \[\]\);\r?\n/g, `  // Excalidraw specific refs\r\n  const deletedEmbeddablePadletIdsRef = useRef<Set<string>>(new Set());\r\n`);
code = code.replace(/  \/\/ Optimistic positions([\s\S]*?)const \[optimisticPositions[\s\S]*?\n/g, '');
code = code.replace(/  const \[activeDragId, setActiveDragId\] = useState<string \| null>\(null\);\r?\n/g, '');
code = code.replace(/  const \[dragDelta, setDragDelta\] = useState<\{ x: number, y: number \} \| null>\(null\);\r?\n/g, '');
code = code.replace(/  const canvasRootRef = useRef<HTMLDivElement \| null>\(null\);\r?\n/g, '');

const handleChangeOld = /    setElements\(elements\);\r?\n    currentFilesRef\.current = files;\r?\n\r?\n    \/\/ Filter out/g;
const handleChangeNew = `    setElements(elements);
    currentFilesRef.current = files;

    if (onDeletePadlet) {
      const deletedEmbeddables = elements.filter((el: any) => 
        el?.type === "embeddable" && 
        el?.isDeleted && 
        typeof el?.link === "string" && 
        el.link.startsWith("padlet://")
      );

      deletedEmbeddables.forEach((el: any) => {
        const padletId = String(el.link).replace("padlet://", "");
        if (!padletId || deletedEmbeddablePadletIdsRef.current.has(padletId)) return;
        deletedEmbeddablePadletIdsRef.current.add(padletId);
        onDeletePadlet(padletId).catch((error) => {
          console.error("Failed to delete padlet after embeddable deletion", error);
        });
      });
    }

    // Filter out`;
code = code.replace(handleChangeOld, handleChangeNew);

const useCanvasActionsCallRegex = /  const \{\r?\n    clipboard,\r?\n    getZ,/g;
const embeddableLogic = `
  const createEmbeddableElementForPadlet = useCallback((padlet: Padlet) => {
    return {
      id: crypto.randomUUID(),
      type: "embeddable" as const,
      x: padlet.position_x,
      y: padlet.position_y,
      width: padlet.width ?? 320,
      height: padlet.height ?? 280,
      angle: 0,
      strokeColor: "#111827",
      backgroundColor: "transparent",
      fillStyle: "solid" as const,
      strokeWidth: 1,
      strokeStyle: "solid" as const,
      roundness: null,
      roughness: 0,
      opacity: 100,
      seed: Math.floor(Math.random() * 2000000000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      index: null,
      isDeleted: false,
      groupIds: [],
      frameId: null,
      boundElements: null,
      updated: Date.now(),
      link: \`padlet://\${padlet.id}\`,
      locked: false,
    };
  }, []);

  const insertPadletEmbeddable = useCallback((padlet: Padlet) => {
    if (!excalidrawAPI || padlet.type === "drawing") return;
    const currentElements = excalidrawAPI.getSceneElements();
    const link = \`padlet://\${padlet.id}\`;
    const alreadyExists = currentElements.some(
      (el: any) => el.type === "embeddable" && !el.isDeleted && el.link === link
    );
    if (alreadyExists) return;
    const embeddable = createEmbeddableElementForPadlet(padlet);
    excalidrawAPI.updateScene({
      elements: [...currentElements, embeddable],
      appState: {
        ...excalidrawAPI.getAppState(),
        selectedElementIds: { [embeddable.id]: true },
      },
      commitToHistory: true,
    });
  }, [createEmbeddableElementForPadlet, excalidrawAPI]);

  useEffect(() => {
    if (!excalidrawAPI) return;
    const nonDrawingPadlets = padlets.filter((p) => p.type !== "drawing");
    if (nonDrawingPadlets.length === 0) return;

    const currentElements = excalidrawAPI.getSceneElements();
    const existingLinks = new Set(
      currentElements
        .filter((el: any) => el.type === "embeddable" && !el.isDeleted && typeof el.link === "string")
        .map((el: any) => el.link)
    );

    const missingEmbeddables = nonDrawingPadlets
      .filter((p) => !existingLinks.has(\`padlet://\${p.id}\`))
      .map((p) => createEmbeddableElementForPadlet(p));

    if (missingEmbeddables.length === 0) return;

    excalidrawAPI.updateScene({
      elements: [...currentElements, ...missingEmbeddables],
      commitToHistory: false,
    });
  }, [createEmbeddableElementForPadlet, excalidrawAPI, padlets]);

  const renderEmbeddable = useCallback((element: any) => {
    const link = typeof element?.link === "string" ? element.link : "";
    if (!link.startsWith("padlet://")) {
      return null;
    }
    const padletId = link.replace("padlet://", "");
    const padlet = padlets.find((p) => String(p.id) === padletId && p.type !== "drawing");
    if (!padlet) {
      return null;
    }
    return (
      <div 
        data-padlet-id={padlet.id}
        className="w-full h-full overflow-hidden rounded-xl border border-gray-200 bg-white"
        onDoubleClick={(e) => {
          e.stopPropagation();
          onPadletEdit?.(padlet);
        }}
        onContextMenu={(e) => handleContextMenu(e, padlet)}
      >
        {padlet.metadata?.topStrip && padlet.metadata.topStrip !== 'transparent' && (
          <div className="h-1.5 w-full flex-shrink-0" style={{ backgroundColor: padlet.metadata.topStrip }} />
        )}
        <div className={\`p-3 h-full overflow-hidden \${padlet.type !== 'link' ? '' : ''}\`}>
          <PostCardContent padlet={padlet} onScan={fetchData} canvasContext="drawing" />
        </div>
      </div>
    );
  }, [fetchData, handleContextMenu, onPadletEdit, padlets]);

  const {
    clipboard,
    getZ,`;
code = code.replace(useCanvasActionsCallRegex, embeddableLogic);

const useCanvasActionsCallClose = /    onDeletePadlet,\r?\n  \}\);/g;
code = code.replace(useCanvasActionsCallClose, `    onDeletePadlet,\r\n    onPadletCreated: insertPadletEmbeddable,\r\n  });`);

code = code.replace(/  \/\/ Drag-to-reposition content padlets[\s\S]*?const handlePointerDown = useCallback/g, `  const handlePointerDown = useCallback`);
code = code.replace(/  \/\/ Clears padlet selection when clicking empty canvas[\s\S]*?togglePadletSelection = useCallback\([\s\S]*?\}\, \[\]\);\r?\n/g, '');

code = code.replace(/onPointerDownCapture=\{handlePointerDown\}/g, '');
code = code.replace(/ref=\{canvasRootRef\}/g, '');

const excalidrawWrapperProps = /          isGroupModeActive=\{activeTool === 'group'\}\r?\n        \/>/g;
code = code.replace(excalidrawWrapperProps, `          isGroupModeActive={activeTool === 'group'}\r\n          renderEmbeddable={renderEmbeddable}\r\n          validateEmbeddable={(link) => link.startsWith("padlet://")}\r\n        />`);

code = code.replace(/      \{\/\* Lasso overlay: sits above everything[\s\S]*?<\/svg>\r?\n      \}/g, '');
code = code.replace(/      \{\/\* Comment pins \+ content padlets.*[\s\S]*?<\/DndContext>\r?\n      \}/g, '');
code = code.replace(/contentPadlets=\{contentPadlets\}/g, '');

code = code.replace(/  const \[mermaidModalOpen, setMermaidModalOpen\] = useState\(false\);\r?\n/g, `  const [mermaidModalOpen, setMermaidModalOpen] = useState(false);

  useEffect(() => {
    const handleMermaidOpen = () => {
      setMermaidModalOpen(true);
    };
    window.addEventListener("open-custom-mermaid", handleMermaidOpen);
    return () => window.removeEventListener("open-custom-mermaid", handleMermaidOpen);
  }, []);
`);

fs.writeFileSync(file, code, 'utf8');
