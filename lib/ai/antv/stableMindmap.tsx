/**
 * PATCH-243. A local copy of AntV Infographic's `hierarchy-mindmap` structure.
 *
 * Copied from @antv/infographic 0.2.20
 * (src/designs/structures/hierarchy-mindmap.tsx), Copyright (c) AntV, MIT
 * License. The ONLY behavioural change is in `getSide`: it returns a datum's
 * stored `side` when present, so a branch keeps the side it was placed on
 * (PATCH-242) instead of flipping with rank parity. With no stored `side` the
 * original rule is used, so stored pictures look exactly as before.
 *
 * Built with AntV's public `jsx()` factory (not JSX syntax): this repo's build
 * keeps JSX on the classic/React transform, so the AntV `jsxImportSource` pragma
 * is not available. It is registered as `stable-hierarchy-mindmap`;
 * `toAntvOptions` points the `hierarchy-mindmap-*` templates at it.
 */
import type { HierarchyData, HierarchyNode } from '@antv/hierarchy';
import { mindmap } from '@antv/hierarchy';
import {
  BtnAdd,
  BtnRemove,
  BtnsGroup,
  Defs,
  FlexLayout,
  getElementBounds,
  getPaletteColor,
  getThemeColors,
  Group,
  ItemsGroup,
  jsx,
  Path,
  registerStructure,
  type BaseStructureProps,
  type ComponentType,
  type ItemDatum,
  type JSXElement,
  type ParsedInfographicOptions,
} from '@antv/infographic';
import { STABLE_MINDMAP_STRUCTURE } from './mapOutline';

type AnnotatedItem = ItemDatum &
  HierarchyData & {
    _indexes: number[];
    _flatIndex?: number;
    side?: 'left' | 'right';
    children?: AnnotatedItem[];
  };

type LayoutNode = HierarchyNode & {
  data: AnnotatedItem;
  children: LayoutNode[];
  parent?: LayoutNode;
};

type LayoutLink = {
  parent: LayoutNode;
  child: LayoutNode;
};

type EdgeAlign = 'top' | 'center' | 'bottom' | number;
type EdgeType = 'curved' | 'straight';
type EdgeColorMode = 'solid' | 'gradient';
type HierarchyColorMode = 'level' | 'branch' | 'node' | 'node-flat' | 'group';

export interface StableHierarchyMindmapProps extends BaseStructureProps {
  levelGap?: number;
  nodeGap?: number;
  edgeAlign?: EdgeAlign;
  colorMode?: HierarchyColorMode;
  edgeColorMode?: EdgeColorMode;
  edgeType?: EdgeType;
  edgeWidth?: number;
}

const DEFAULT_LEVEL_GAP = 60;
const DEFAULT_NODE_GAP = 14;
const LAYOUT_PADDING = 30;
const DEFAULT_EDGE_ALIGN: EdgeAlign = 'center';
const DEFAULT_EDGE_TYPE: EdgeType = 'curved';
const DEFAULT_EDGE_WIDTH = 2;
const DEFAULT_COLOR_MODE: HierarchyColorMode = 'node';
const DEFAULT_EDGE_COLOR_MODE: EdgeColorMode = 'solid';

// ── Small private copies of helpers AntV does not export publicly ────────────

function getColorPrimary(options: ParsedInfographicOptions): string {
  return options?.themeConfig?.colorPrimary || '#FF356A';
}

/**
 * The package root exports the low-level `getPaletteColor(palette, indexes,
 * total)`; AntV's private designs-utils wrapper takes the options object. This
 * mirrors that wrapper.
 */
function paletteColor(options: ParsedInfographicOptions, indexes: number[]): string | undefined {
  return getPaletteColor(options?.themeConfig?.palette ?? [], indexes, options.data?.items?.length);
}

function getItemComponent(Items: BaseStructureProps['Items'], level?: number) {
  if (Items.length === 0) return () => null;
  if (level === undefined) return Items[0];
  return Items[level] ?? Items[0];
}

function getHierarchyColorIndexes(
  node: { depth: number; originalIndexes: number[]; flatIndex?: number },
  mode: HierarchyColorMode,
): number[] {
  const { depth, originalIndexes, flatIndex } = node;
  switch (mode) {
    case 'level':
      return [depth];
    case 'branch':
      if (depth === 0) return [0];
      return [originalIndexes[1] + 1];
    case 'node':
      return originalIndexes;
    case 'node-flat':
      return flatIndex !== undefined ? [flatIndex] : originalIndexes;
    default:
      return [0];
  }
}

const annotateTree = (
  node: ItemDatum & HierarchyData,
  parentIndexes: number[] = [],
  index = 0,
): AnnotatedItem => {
  const indexes = [...parentIndexes, index];
  return {
    ...node,
    _indexes: indexes,
    children:
      node.children?.map((child, childIndex) =>
        annotateTree(child, indexes, childIndex),
      ) ?? [],
  };
};

const collectNodes = (
  node: LayoutNode,
  nodes: LayoutNode[],
  links: LayoutLink[],
  parent?: LayoutNode,
) => {
  nodes.push(node);
  node.data._flatIndex ??= nodes.length - 1;
  if (parent) links.push({ parent, child: node });
  const children = node.children as unknown as LayoutNode[];
  children?.forEach((child) => collectNodes(child, nodes, links, node));
};

const createCurvePath = (sx: number, sy: number, tx: number, ty: number) => {
  const offsetX = Math.abs(tx - sx) / 2;
  const ctrlX1 = tx > sx ? sx + offsetX : sx - offsetX;
  const ctrlX2 = tx > sx ? tx - offsetX : tx + offsetX;
  return `M ${sx} ${sy} C ${ctrlX1} ${sy} ${ctrlX2} ${ty} ${tx} ${ty}`;
};

const createStraightPath = (sx: number, sy: number, tx: number, ty: number) =>
  `M ${sx} ${sy} L ${tx} ${ty}`;

const getEdgeAnchors = (
  parentLayout: { x: number; y: number; width: number; height: number },
  childLayout: { x: number; y: number; width: number; height: number },
  childSide?: 'left' | 'right',
  align: EdgeAlign = DEFAULT_EDGE_ALIGN,
) => {
  const clampRatio = (val: number) => Math.max(0, Math.min(1, val));
  const toRatio = (value: EdgeAlign) => {
    if (value === 'top') return 0;
    if (value === 'bottom') return 1;
    if (value === 'center') return 0.5;
    return clampRatio(value);
  };
  const ratio = toRatio(align);
  const parentCy = parentLayout.y + parentLayout.height * ratio;
  const childCy = childLayout.y + childLayout.height * ratio;
  if (childSide === 'left') {
    return {
      sx: parentLayout.x,
      sy: parentCy,
      tx: childLayout.x + childLayout.width,
      ty: childCy,
    };
  }
  return {
    sx: parentLayout.x + parentLayout.width,
    sy: parentCy,
    tx: childLayout.x,
    ty: childCy,
  };
};

export const StableHierarchyMindmap: ComponentType<StableHierarchyMindmapProps> = (
  props,
) => {
  const {
    Title,
    Items,
    data,
    levelGap = DEFAULT_LEVEL_GAP,
    nodeGap = DEFAULT_NODE_GAP,
    edgeAlign = DEFAULT_EDGE_ALIGN,
    colorMode = DEFAULT_COLOR_MODE,
    edgeColorMode = DEFAULT_EDGE_COLOR_MODE,
    edgeType = DEFAULT_EDGE_TYPE,
    edgeWidth = DEFAULT_EDGE_WIDTH,
    options,
  } = props;
  const { title, desc, items = [] } = data;
  const titleContent = Title ? jsx(Title, { title, desc }) : null;
  const colorPrimary = getColorPrimary(options);
  const btnBounds = getElementBounds(jsx(BtnAdd, { indexes: [0] }));
  const groupColorIndexMap = new Map<string, number>();
  let nextGroupColorIndex = 0;

  if (!items.length || !Items?.length) {
    return jsx(FlexLayout, {
      id: 'infographic-container',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      children: [
        titleContent,
        jsx(Group, { children: jsx(BtnAdd, { indexes: [0], x: 0, y: 0 }) }),
      ],
    });
  }

  const root = annotateTree(items[0]);
  const nodeSizeCache = new WeakMap<
    AnnotatedItem,
    { width: number; height: number }
  >();
  const colorCache = new WeakMap<AnnotatedItem, string>();
  const themeCache = new WeakMap<AnnotatedItem, unknown>();

  const getNodeColorIndexes = (datum: AnnotatedItem, depth: number) => {
    if (colorMode === 'group') {
      const groupKey = String((datum as { group?: unknown }).group ?? '');
      let groupIndex = groupColorIndexMap.get(groupKey);
      if (groupIndex == null) {
        groupIndex = nextGroupColorIndex;
        groupColorIndexMap.set(groupKey, groupIndex);
        nextGroupColorIndex += 1;
      }
      return [groupIndex];
    }
    return getHierarchyColorIndexes(
      {
        depth,
        originalIndexes: datum._indexes,
        flatIndex: datum._flatIndex,
      },
      colorMode,
    );
  };

  const getNodeThemeColors = (datum: AnnotatedItem, depth: number) => {
    const cachedTheme = themeCache.get(datum);
    if (cachedTheme) return cachedTheme;
    const colorIndexes = getNodeColorIndexes(datum, depth);
    const primary = paletteColor(options, colorIndexes);
    const themeColors = getThemeColors({ colorPrimary: primary }, options);
    themeCache.set(datum, themeColors);
    colorCache.set(datum, primary!);
    return themeColors;
  };
  const measureNode = (
    datum: AnnotatedItem,
  ): { width: number; height: number } => {
    const cached = nodeSizeCache.get(datum);
    if (cached) return cached;
    const depth = Math.max(datum._indexes.length - 1, 0);
    const Component = getItemComponent(Items, depth);
    const bounds = getElementBounds(
      jsx(Component, {
        indexes: datum._indexes,
        data,
        datum,
        positionH: 'center',
        positionV: 'middle',
        themeColors: getNodeThemeColors(datum, depth),
      }),
    );
    nodeSizeCache.set(datum, bounds);
    return bounds;
  };

  const mindmapRoot = mindmap(root, {
    direction: 'H',
    // PATCH-243: the one change -- a stored side wins over rank parity.
    getSide: (node: HierarchyNode, index: number) => {
      if (!node.parent) return 'right';
      const stored = node.data?.side;
      if (stored === 'left' || stored === 'right') return stored;
      const order = (node.parent.children || []).indexOf(node);
      const rank = order >= 0 ? order : index;
      return rank % 2 === 0 ? 'left' : 'right';
    },
    getWidth: (datum: AnnotatedItem) => measureNode(datum).width,
    getHeight: (datum: AnnotatedItem) => measureNode(datum).height,
    getHGap: () => levelGap,
    getVGap: () => nodeGap,
  }) as LayoutNode;

  const layoutNodes: LayoutNode[] = [];
  const nodeLinks: LayoutLink[] = [];
  collectNodes(mindmapRoot, layoutNodes, nodeLinks);

  const minX =
    layoutNodes.length > 0 ? Math.min(...layoutNodes.map((node) => node.x)) : 0;
  const minY =
    layoutNodes.length > 0 ? Math.min(...layoutNodes.map((node) => node.y)) : 0;
  const shiftX = LAYOUT_PADDING - minX;
  const shiftY = LAYOUT_PADDING - minY;

  const defsElements: JSXElement[] = [];
  const decorElements: JSXElement[] = [];
  const itemElements: JSXElement[] = [];
  const btnElements: JSXElement[] = [];
  const layoutStore = new WeakMap<
    LayoutNode,
    {
      x: number;
      y: number;
      width: number;
      height: number;
      centerX: number;
      centerY: number;
    }
  >();

  layoutNodes.forEach((node) => {
    const datum = node.data;
    const measured = measureNode(datum);
    const displayX = node.x + shiftX + (node.hgap ?? 0);
    const displayY = node.y + shiftY + (node.vgap ?? 0);
    const Component = getItemComponent(Items, node.depth);
    const positionH =
      node.depth === 0 ? 'center' : node.side === 'left' ? 'flipped' : 'normal';
    const themeColors = getNodeThemeColors(datum, node.depth);

    itemElements.push(
      jsx(Component, {
        indexes: datum._indexes,
        data,
        datum,
        x: displayX,
        y: displayY,
        positionH,
        positionV: 'middle',
        themeColors,
      }),
    );

    layoutStore.set(node, {
      x: displayX,
      y: displayY,
      width: measured.width,
      height: measured.height,
      centerX: displayX + measured.width / 2,
      centerY: displayY + measured.height / 2,
    });
  });

  nodeLinks.forEach((link) => {
    const { parent, child } = link;
    const childLayout = layoutStore.get(child);
    const parentLayout = layoutStore.get(parent);
    if (!childLayout || !parentLayout) {
      return;
    }
    const childDatum = child.data;
    const { sx, sy, tx, ty } = getEdgeAnchors(
      parentLayout,
      childLayout,
      child.side,
      edgeAlign,
    );
    const childColor =
      colorCache.get(childDatum) ??
      paletteColor(options, getNodeColorIndexes(childDatum, child.depth));
    const parentColor =
      colorCache.get(parent.data) ??
      paletteColor(options, getNodeColorIndexes(parent.data, parent.depth));
    const pathD =
      edgeType === 'straight'
        ? createStraightPath(sx, sy, tx, ty)
        : createCurvePath(sx, sy, tx, ty);
    const gradientId = `edge-gradient-${childDatum._indexes.join('-')}`;
    decorElements.push(
      jsx(Path, {
        d: pathD,
        stroke:
          edgeColorMode === 'gradient'
            ? `url(#${gradientId})`
            : (childColor ?? colorPrimary),
        strokeWidth: edgeWidth,
        fill: 'none',
      }),
    );
    if (edgeColorMode === 'gradient') {
      defsElements.push(
        jsx('linearGradient', {
          id: gradientId,
          gradientUnits: 'userSpaceOnUse',
          x1: sx,
          y1: sy,
          x2: tx,
          y2: ty,
          children: [
            jsx('stop', { offset: '0%', stopColor: parentColor ?? colorPrimary }),
            jsx('stop', { offset: '100%', stopColor: childColor ?? colorPrimary }),
          ],
        }),
      );
    }
    const appendIndex = childDatum.children?.length ?? 0;
    const addIndexes = [...childDatum._indexes, appendIndex];
    const btnX = childLayout.x + (childLayout.width - btnBounds.width) / 2;
    const removeY = childLayout.y + childLayout.height + 8;
    const addY = removeY + btnBounds.height + 6;

    if (child.depth > 0) {
      btnElements.push(
        jsx(BtnRemove, { indexes: childDatum._indexes, x: btnX, y: removeY }),
      );
    }
    btnElements.push(jsx(BtnAdd, { indexes: addIndexes, x: btnX, y: addY }));
  });

  const rootLayout = layoutStore.get(mindmapRoot);
  if (rootLayout) {
    const rootDatum = mindmapRoot.data;
    const appendIndex = rootDatum.children?.length ?? 0;
    const addIndexes = [...rootDatum._indexes, appendIndex];
    const btnX = rootLayout.x + (rootLayout.width - btnBounds.width) / 2;
    const addY = rootLayout.y + rootLayout.height + 8 + btnBounds.height + 6;
    btnElements.push(jsx(BtnAdd, { indexes: addIndexes, x: btnX, y: addY }));
  }

  return jsx(FlexLayout, {
    id: 'infographic-container',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    children: [
      titleContent,
      jsx(Group, {
        children: [
          defsElements.length > 0 ? jsx(Defs, { children: defsElements }) : null,
          jsx(Group, { children: decorElements }),
          jsx(ItemsGroup, { children: itemElements }),
          jsx(BtnsGroup, { children: btnElements }),
        ],
      }),
    ],
  });
};

registerStructure(STABLE_MINDMAP_STRUCTURE, {
  component: StableHierarchyMindmap,
  composites: ['title', 'item'],
});
