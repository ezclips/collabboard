/**
 * PATCH-237. The fixed set of Lucide icon names an outline item may carry. A
 * fixed list (not a dynamic import by string) keeps the icon map explicit and
 * every name verified to exist in the installed lucide-react.
 */
export const VISUAL_ICON_NAMES = [
  'sun', 'moon', 'cloud-rain', 'leaf', 'snowflake', 'flower-2',
  'clock', 'calendar', 'alarm-clock',
  'glass-water', 'dumbbell', 'utensils',
  'list-checks', 'target', 'flag', 'rocket', 'lightbulb', 'brain',
  'book-open', 'graduation-cap',
  'users', 'user', 'heart', 'shield', 'lock', 'key',
  'dollar-sign', 'chart-line', 'chart-pie', 'trending-up', 'trending-down',
  'search', 'settings', 'wrench', 'hammer',
  'code', 'database', 'server', 'cloud',
  'globe', 'map', 'map-pin', 'home', 'building-2', 'briefcase',
  'shopping-cart', 'truck', 'plane', 'car',
  'phone', 'mail', 'message-circle', 'camera', 'music', 'star', 'award',
  'check-circle', 'alert-triangle', 'x-circle', 'help-circle',
  'layers', 'puzzle', 'zap', 'recycle', 'sprout',
] as const;

export type VisualIconName = (typeof VISUAL_ICON_NAMES)[number];

const VISUAL_ICON_SET = new Set<string>(VISUAL_ICON_NAMES);

export function isVisualIconName(value: unknown): value is VisualIconName {
  return typeof value === 'string' && VISUAL_ICON_SET.has(value);
}
