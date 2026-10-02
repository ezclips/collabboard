import { antvTemplateInfo } from '@/lib/ai/antv/catalog';

/**
 * PATCH-246. One family per design, so the AI picture window can filter its
 * gallery locally instead of asking for a generator. Pure: it reads the option
 * key and its category only.
 */

export type PictureFamily =
  | 'flow'
  | 'mindmap'
  | 'hierarchy'
  | 'list'
  | 'timeline'
  | 'comparison'
  | 'chart';

/** Chip/order of the families, matching the gallery's headings. */
export const PICTURE_FAMILIES: readonly PictureFamily[] = [
  'flow',
  'mindmap',
  'hierarchy',
  'list',
  'timeline',
  'comparison',
  'chart',
];

export const PICTURE_FAMILY_LABELS: Record<PictureFamily, string> = {
  flow: 'Flow & steps',
  mindmap: 'Mind map',
  hierarchy: 'Hierarchy',
  list: 'Lists',
  timeline: 'Timeline',
  comparison: 'Comparison',
  chart: 'Chart',
};

interface FamilyInput {
  key: string;
  category?: string;
}

const ANTV_PREFIX = 'antv:';
const INFOGRAPHIC_PREFIX = 'infographic:';

/**
 * The family a suggestion belongs to. AntV names are read from the committed
 * catalogue (category + family); ours are read from the key.
 */
export function pictureFamily(option: FamilyInput): PictureFamily {
  const { key } = option;

  if (key.startsWith(ANTV_PREFIX)) {
    const name = key.slice(ANTV_PREFIX.length);
    const info = antvTemplateInfo(name);
    const category = info?.category ?? option.category ?? '';
    const family = info?.family ?? '';

    if (category === 'sequence') {
      return family.includes('timeline') || name.includes('timeline') ? 'timeline' : 'flow';
    }
    if (category === 'hierarchy') {
      return family.startsWith('hierarchy-mindmap') ? 'mindmap' : 'hierarchy';
    }
    if (category === 'chart') return 'chart';
    if (category === 'compare') return 'comparison';
    return 'list';
  }

  if (key === 'flow') return 'flow';
  if (key === 'mindmap') return 'mindmap';
  if (key === 'timeline') return 'timeline';
  if (key === 'comparison') return 'comparison';

  if (key.startsWith(INFOGRAPHIC_PREFIX)) {
    const template = key.slice(INFOGRAPHIC_PREFIX.length);
    if (template === 'stairs' || template === 'funnel' || template === 'cycle') return 'flow';
    if (template === 'hub') return 'mindmap';
    if (template === 'pyramid' || template === 'stack') return 'hierarchy';
  }

  if (option.category === 'chart') return 'chart';
  return 'list';
}

/**
 * PATCH-248. The family a Diagram subtype button opens. `null` means "all
 * designs" -- used for any subtype without a family button (e.g. infographic).
 */
export function familyForSubtype(subtype: string): PictureFamily | null {
  switch (subtype) {
    case 'flowchart':
      return 'flow';
    case 'mindmap':
      return 'mindmap';
    case 'timeline':
      return 'timeline';
    case 'comparison':
      return 'comparison';
    case 'pie_chart':
    case 'bar_chart':
      return 'chart';
    default:
      return null;
  }
}
