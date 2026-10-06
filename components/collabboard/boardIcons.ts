import {
  BookOpen,
  Calendar,
  Camera,
  FlaskConical,
  Globe,
  GraduationCap,
  Heart,
  Layout,
  Lightbulb,
  MapPin,
  Music,
  PenLine,
  Rocket,
  Sparkles,
  Star,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * PATCH-301. The board line-icon set. A board icon stored as
 * `lucide:<name>` renders through this map, so an unknown name falls back to
 * `layout` instead of crashing the header.
 */
export const BOARD_LINE_ICON_NAMES = [
  'layout',
  'star',
  'heart',
  'lightbulb',
  'book-open',
  'map-pin',
  'calendar',
  'globe',
  'camera',
  'music',
  'flask-conical',
  'graduation-cap',
  'rocket',
  'users',
  'target',
  'pen-line',
  'sparkles',
] as const;

export type BoardLineIconName = (typeof BOARD_LINE_ICON_NAMES)[number];

const ICONS: Record<BoardLineIconName, LucideIcon> = {
  layout: Layout,
  star: Star,
  heart: Heart,
  lightbulb: Lightbulb,
  'book-open': BookOpen,
  'map-pin': MapPin,
  calendar: Calendar,
  globe: Globe,
  camera: Camera,
  music: Music,
  'flask-conical': FlaskConical,
  'graduation-cap': GraduationCap,
  rocket: Rocket,
  users: Users,
  target: Target,
  'pen-line': PenLine,
  sparkles: Sparkles,
};

/** The six icons the board form shows before the full picker. */
export const BOARD_QUICK_ICON_NAMES: readonly BoardLineIconName[] = [
  'layout',
  'star',
  'lightbulb',
  'book-open',
  'map-pin',
  'globe',
];

export function lineIconFor(name: string): LucideIcon {
  return (ICONS as Record<string, LucideIcon>)[name] ?? Layout;
}
