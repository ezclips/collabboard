/**
 * PATCH-241. Lucide's raw geometry, as data. `@antv/infographic` draws icons by
 * loading a `<symbol>` into its SVG `<defs>`; the React components in
 * `components/ai/renderers/visualIconMap.tsx` cannot be serialised for that.
 * Each Lucide icon module exports its `__iconNode` (a `[tag, attrs][]` list),
 * so we import that directly and build the symbol ourselves -- no network, no
 * remote icon search, and no innerHTML from outline data.
 *
 * The loader NEVER returns null: an unknown name gets a neutral dot symbol, so
 * AntV's fallback icon search (a remote call) is never reached.
 */

import { __iconNode as sun } from 'lucide-react/dist/esm/icons/sun.js';
import { __iconNode as moon } from 'lucide-react/dist/esm/icons/moon.js';
import { __iconNode as cloudRain } from 'lucide-react/dist/esm/icons/cloud-rain.js';
import { __iconNode as leaf } from 'lucide-react/dist/esm/icons/leaf.js';
import { __iconNode as snowflake } from 'lucide-react/dist/esm/icons/snowflake.js';
import { __iconNode as flower2 } from 'lucide-react/dist/esm/icons/flower-2.js';
import { __iconNode as clock } from 'lucide-react/dist/esm/icons/clock.js';
import { __iconNode as calendar } from 'lucide-react/dist/esm/icons/calendar.js';
import { __iconNode as alarmClock } from 'lucide-react/dist/esm/icons/alarm-clock.js';
import { __iconNode as glassWater } from 'lucide-react/dist/esm/icons/glass-water.js';
import { __iconNode as dumbbell } from 'lucide-react/dist/esm/icons/dumbbell.js';
import { __iconNode as utensils } from 'lucide-react/dist/esm/icons/utensils.js';
import { __iconNode as listChecks } from 'lucide-react/dist/esm/icons/list-checks.js';
import { __iconNode as target } from 'lucide-react/dist/esm/icons/target.js';
import { __iconNode as flag } from 'lucide-react/dist/esm/icons/flag.js';
import { __iconNode as rocket } from 'lucide-react/dist/esm/icons/rocket.js';
import { __iconNode as lightbulb } from 'lucide-react/dist/esm/icons/lightbulb.js';
import { __iconNode as brain } from 'lucide-react/dist/esm/icons/brain.js';
import { __iconNode as bookOpen } from 'lucide-react/dist/esm/icons/book-open.js';
import { __iconNode as graduationCap } from 'lucide-react/dist/esm/icons/graduation-cap.js';
import { __iconNode as users } from 'lucide-react/dist/esm/icons/users.js';
import { __iconNode as user } from 'lucide-react/dist/esm/icons/user.js';
import { __iconNode as heart } from 'lucide-react/dist/esm/icons/heart.js';
import { __iconNode as shield } from 'lucide-react/dist/esm/icons/shield.js';
import { __iconNode as lock } from 'lucide-react/dist/esm/icons/lock.js';
import { __iconNode as key } from 'lucide-react/dist/esm/icons/key.js';
import { __iconNode as dollarSign } from 'lucide-react/dist/esm/icons/dollar-sign.js';
import { __iconNode as chartLine } from 'lucide-react/dist/esm/icons/chart-line.js';
import { __iconNode as chartPie } from 'lucide-react/dist/esm/icons/chart-pie.js';
import { __iconNode as trendingUp } from 'lucide-react/dist/esm/icons/trending-up.js';
import { __iconNode as trendingDown } from 'lucide-react/dist/esm/icons/trending-down.js';
import { __iconNode as search } from 'lucide-react/dist/esm/icons/search.js';
import { __iconNode as settings } from 'lucide-react/dist/esm/icons/settings.js';
import { __iconNode as wrench } from 'lucide-react/dist/esm/icons/wrench.js';
import { __iconNode as hammer } from 'lucide-react/dist/esm/icons/hammer.js';
import { __iconNode as code } from 'lucide-react/dist/esm/icons/code.js';
import { __iconNode as database } from 'lucide-react/dist/esm/icons/database.js';
import { __iconNode as server } from 'lucide-react/dist/esm/icons/server.js';
import { __iconNode as cloud } from 'lucide-react/dist/esm/icons/cloud.js';
import { __iconNode as globe } from 'lucide-react/dist/esm/icons/globe.js';
import { __iconNode as map } from 'lucide-react/dist/esm/icons/map.js';
import { __iconNode as mapPin } from 'lucide-react/dist/esm/icons/map-pin.js';
import { __iconNode as home } from 'lucide-react/dist/esm/icons/house.js';
import { __iconNode as building2 } from 'lucide-react/dist/esm/icons/building-2.js';
import { __iconNode as briefcase } from 'lucide-react/dist/esm/icons/briefcase.js';
import { __iconNode as shoppingCart } from 'lucide-react/dist/esm/icons/shopping-cart.js';
import { __iconNode as truck } from 'lucide-react/dist/esm/icons/truck.js';
import { __iconNode as plane } from 'lucide-react/dist/esm/icons/plane.js';
import { __iconNode as car } from 'lucide-react/dist/esm/icons/car.js';
import { __iconNode as phone } from 'lucide-react/dist/esm/icons/phone.js';
import { __iconNode as mail } from 'lucide-react/dist/esm/icons/mail.js';
import { __iconNode as messageCircle } from 'lucide-react/dist/esm/icons/message-circle.js';
import { __iconNode as camera } from 'lucide-react/dist/esm/icons/camera.js';
import { __iconNode as music } from 'lucide-react/dist/esm/icons/music.js';
import { __iconNode as star } from 'lucide-react/dist/esm/icons/star.js';
import { __iconNode as award } from 'lucide-react/dist/esm/icons/award.js';
import { __iconNode as checkCircle } from 'lucide-react/dist/esm/icons/circle-check-big.js';
import { __iconNode as alertTriangle } from 'lucide-react/dist/esm/icons/triangle-alert.js';
import { __iconNode as xCircle } from 'lucide-react/dist/esm/icons/circle-x.js';
import { __iconNode as helpCircle } from 'lucide-react/dist/esm/icons/circle-question-mark.js';
import { __iconNode as layers } from 'lucide-react/dist/esm/icons/layers.js';
import { __iconNode as puzzle } from 'lucide-react/dist/esm/icons/puzzle.js';
import { __iconNode as zap } from 'lucide-react/dist/esm/icons/zap.js';
import { __iconNode as recycle } from 'lucide-react/dist/esm/icons/recycle.js';
import { __iconNode as sprout } from 'lucide-react/dist/esm/icons/sprout.js';

import type { VisualIconName } from '@/lib/ai/visualIcons';

type IconNodeChild = readonly [string, Readonly<Record<string, string | number>>];
export type IconNode = readonly IconNodeChild[];

/** PATCH-241. The `lucide/<name>` prefix outline icons use in AntV data. */
export const ANTV_ICON_PREFIX = 'lucide/';

/** Every name in VISUAL_ICON_NAMES, resolved to its Lucide geometry. */
const ICON_NODES: Record<VisualIconName, IconNode> = {
  sun,
  moon,
  'cloud-rain': cloudRain,
  leaf,
  snowflake,
  'flower-2': flower2,
  clock,
  calendar,
  'alarm-clock': alarmClock,
  'glass-water': glassWater,
  dumbbell,
  utensils,
  'list-checks': listChecks,
  target,
  flag,
  rocket,
  lightbulb,
  brain,
  'book-open': bookOpen,
  'graduation-cap': graduationCap,
  users,
  user,
  heart,
  shield,
  lock,
  key,
  'dollar-sign': dollarSign,
  'chart-line': chartLine,
  'chart-pie': chartPie,
  'trending-up': trendingUp,
  'trending-down': trendingDown,
  search,
  settings,
  wrench,
  hammer,
  code,
  database,
  server,
  cloud,
  globe,
  map,
  'map-pin': mapPin,
  home,
  'building-2': building2,
  briefcase,
  'shopping-cart': shoppingCart,
  truck,
  plane,
  car,
  phone,
  mail,
  'message-circle': messageCircle,
  camera,
  music,
  star,
  award,
  'check-circle': checkCircle,
  'alert-triangle': alertTriangle,
  'x-circle': xCircle,
  'help-circle': helpCircle,
  layers,
  puzzle,
  zap,
  recycle,
  sprout,
};

const DOT_SYMBOL = '<circle cx="12" cy="12" r="3" />';

function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderChild([tag, attrs]: IconNodeChild): string {
  const pairs = Object.entries(attrs)
    // `key` is React's bookkeeping, not geometry.
    .filter(([name]) => name !== 'key')
    .map(([name, value]) => `${name}="${escapeXml(value)}"`);
  return `<${tag}${pairs.length ? ` ${pairs.join(' ')}` : ''} />`;
}

/**
 * An SVG `<symbol>` for one of our icon names, or a neutral dot for anything
 * else. Stroke-only like Lucide (round caps/joins, width 2).
 */
export function iconSymbolSvg(name: string | undefined | null): string {
  const node = name ? (ICON_NODES as Record<string, IconNode>)[name] : undefined;
  const body = node ? node.map(renderChild).join('') : DOT_SYMBOL;
  return (
    '<symbol viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`
  );
}
