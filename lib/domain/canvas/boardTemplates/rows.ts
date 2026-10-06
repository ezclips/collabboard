import type {
  BoardTemplate,
  BoardTemplateLayout,
  ContentPost,
  TemplatePost,
} from './schema';

/**
 * PATCH-296. Row building for all six layouts. The freeform branch keeps
 * every PATCH-293 rule byte-for-byte; each other layout emits its own
 * container metadata and ignores free positions.
 */

type TemplateRow = Record<string, unknown> & { id: string };

const CONTAINER_SIZE: Record<BoardTemplateLayout, { width: number; height: number }> = {
  freeform: { width: 0, height: 0 },
  columns: { width: 280, height: 200 },
  grid: { width: 280, height: 200 },
  wall: { width: 280, height: 200 },
  timeline: { width: 280, height: 200 },
  map: { width: 320, height: 220 },
};

function placementMetadata(
  parentId: string | undefined,
  width: number | undefined,
  height: number | undefined,
  manualSize: boolean,
): Record<string, unknown> {
  return {
    ...(parentId === undefined ? {} : { parentId }),
    ...(manualSize && (width !== undefined || height !== undefined) ? { manualSize: true } : {}),
  };
}

function sectionMetadata(
  post: TemplatePost,
  sectionIds: Record<string, number> | undefined,
  sectionPosition: Map<TemplatePost, number>,
): Record<string, unknown> {
  if (sectionIds === undefined || post.section === undefined) return {};
  const id = sectionIds[post.section];
  if (id === undefined) return {};
  return { sectionId: String(id), sectionPosition: sectionPosition.get(post) ?? 0 };
}

/**
 * Pure. Containers first, each child's parentId set and each container's
 * ordered childPadletIds filled from ids generated up front. `newId` is
 * injected for deterministic tests; `sectionIds` maps a section key to the
 * numeric `board_sections` id and is required by columns/grid only.
 */
export function buildTemplateRows(
  boardId: string,
  template: BoardTemplate,
  newId: () => string,
  sectionIds?: Record<string, number>,
): object[] {
  const freeform = template.layout === 'freeform';
  const ids = new Map<TemplatePost, string>();
  for (const post of template.posts) ids.set(post, newId());

  const columnIds = new Map<string, string>();
  for (const post of template.posts) {
    if (post.kind === 'column') columnIds.set(post.key, ids.get(post)!);
  }

  const sectionPosition = new Map<TemplatePost, number>();
  if (!freeform) {
    const counts = new Map<string, number>();
    for (const post of template.posts) {
      if (post.kind === 'section') continue;
      const isRoot = post.kind === 'column' || post.parent === undefined;
      if (!isRoot || post.section === undefined) continue;
      const count = counts.get(post.section) ?? 0;
      sectionPosition.set(post, count);
      counts.set(post.section, count + 1);
    }
  }

  const rows: TemplateRow[] = [];

  let containerIndex = 0;
  for (const post of template.posts) {
    if (post.kind !== 'column') continue;
    const childIds = template.posts
      .filter((candidate): candidate is ContentPost => candidate.kind !== 'column' && candidate.kind !== 'section' && candidate.parent === post.key)
      .map((child) => ids.get(child)!);

    if (freeform) {
      rows.push({
        id: ids.get(post)!,
        board_id: boardId,
        type: 'container',
        title: post.title,
        content: '',
        position_x: post.x,
        position_y: post.y,
        width: post.width,
        ...(post.height !== undefined ? { height: post.height } : {}),
        metadata: {
          ...placementMetadata(undefined, post.width, post.height, true),
          isContainer: true,
          orientation: 'vertical',
          childPadletIds: childIds,
          startExpanded: true,
          ...(post.topStrip !== undefined ? { topStrip: post.topStrip } : {}),
        },
      });
      containerIndex += 1;
      continue;
    }

    const size = CONTAINER_SIZE[template.layout];
    const metadata: Record<string, unknown> = {
      isContainer: true,
      kind: 'container',
      orientation: 'vertical',
      childPadletIds: childIds,
      cardColor: '#ffffff',
      startExpanded: true,
      ...sectionMetadata(post, sectionIds, sectionPosition),
    };
    if (template.layout === 'wall') metadata.wallPosition = containerIndex;
    if (template.layout === 'timeline') {
      metadata.position_in_timeline = containerIndex;
      metadata.topStrip = post.topStrip ?? 'transparent';
      if (post.timelineLabel !== undefined) metadata.timelineLabel = post.timelineLabel;
    } else if (post.topStrip !== undefined) {
      metadata.topStrip = post.topStrip;
    }
    if (template.layout === 'map' && post.location) {
      metadata.mapLocation = {
        lng: post.location.lng,
        lat: post.location.lat,
        label: post.location.label,
      };
    }

    rows.push({
      id: ids.get(post)!,
      board_id: boardId,
      type: 'container',
      title: post.title,
      content: '',
      position_x: 0,
      position_y: 0,
      width: post.width ?? size.width,
      height: post.height ?? size.height,
      ...(template.layout === 'map' && post.location
        ? {
            location_lat: post.location.lat,
            location_lng: post.location.lng,
            location_label: post.location.label,
          }
        : {}),
      metadata,
    });
    containerIndex += 1;
  }

  for (const post of template.posts) {
    if (post.kind === 'column' || post.kind === 'section') continue;
    const id = ids.get(post)!;
    const parent = post.parent;
    const parentId = parent === undefined ? undefined : columnIds.get(parent);
    const shared = {
      id,
      board_id: boardId,
      title: post.title,
      position_x: post.x ?? 0,
      position_y: post.y ?? 0,
      ...(post.width !== undefined ? { width: post.width } : {}),
      ...(post.height !== undefined ? { height: post.height } : {}),
    };
    const placement = {
      ...placementMetadata(parentId, post.width, post.height, freeform),
      ...sectionMetadata(post, sectionIds, sectionPosition),
    };

    switch (post.kind) {
      case 'note':
        rows.push({ ...shared, type: 'text', content: post.html, metadata: placement });
        break;
      case 'todo': {
        const tasks = post.tasks.map((task, index) => ({ id: `${id}-task-${index}`, text: task.text, completed: task.done }));
        rows.push({
          ...shared,
          type: 'todo',
          content: JSON.stringify(tasks),
          metadata: { ...placement, tasks, todoTitle: post.title },
        });
        break;
      }
      case 'table': {
        const [header = [], ...body] = post.rows;
        rows.push({
          ...shared,
          type: 'table',
          content: JSON.stringify({ rows: body, columns: header }),
          metadata: placement,
        });
        break;
      }
      case 'image':
        rows.push({
          ...shared,
          type: 'image',
          content: '',
          file_url: post.src,
          width: post.width ?? 300,
          height: post.height ?? 200,
          metadata: {
            imageUrl: post.src,
            ...(post.caption !== undefined ? { caption: post.caption } : {}),
            ...placement,
          },
        });
        break;
      case 'clipart':
        rows.push({
          ...shared,
          type: 'card',
          content: '',
          width: 180,
          height: 220,
          metadata: {
            svgUrl: post.svg,
            iconColor: post.iconColor ?? '#000000',
            iconBgColor: post.iconBgColor,
            counterType: 'words',
            ...placement,
          },
        });
        break;
    }
  }
  return rows;
}
