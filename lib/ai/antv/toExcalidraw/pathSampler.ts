/**
 * PATCH-278 A.1. Analytic SVG path sampling. The spike's roadmap row took
 * 420 ms because `getPointAtLength` was called ~1,200 times; parsing `d` and
 * computing lines/curves/arcs directly is a pure function of the path data and
 * removes the browser call entirely. `geometry.ts` still falls back to
 * `getPointAtLength` when this returns null (an unparsable `d`), and counts it.
 *
 * Units are the path's LOCAL user units; the caller maps them through the
 * element matrix. Straight runs keep their exact end points; cubic/quadratic
 * curves and arcs are sampled at no more than `spacing` (default 4) user units.
 */

export interface GeometryPointLike {
  x: number;
  y: number;
}

export interface SamplePathOptions {
  /** Maximum distance between sampled points on curves/arcs. Default 4. */
  spacing?: number;
}

const DEFAULT_SPACING = 4;

/** Argument count per command (upper-case). */
const ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

interface SegmentCommand {
  cmd: string;
  args: number[];
}

type Token = string | number;

const NUMBER_RE = /^[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/;

/** Tokenises `d` into command letters and numbers. Null when it cannot. */
function tokenize(d: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < d.length) {
    const ch = d[i];
    if (ch === ' ' || ch === ',' || ch === '\n' || ch === '\r' || ch === '\t' || ch === '\f') {
      i += 1;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      tokens.push(ch);
      i += 1;
      continue;
    }
    const match = NUMBER_RE.exec(d.slice(i));
    if (!match || match[0].length === 0) return null;
    tokens.push(Number.parseFloat(match[0]));
    i += match[0].length;
  }
  return tokens;
}

/** Expands tokens into one entry per drawn segment, honouring implicit repeats. */
function toCommands(tokens: Token[]): SegmentCommand[] | null {
  const commands: SegmentCommand[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (typeof token !== 'string') return null;
    const upper = token.toUpperCase();
    const arity = ARITY[upper];
    if (arity === undefined) return null;
    if (upper === 'Z') {
      commands.push({ cmd: token, args: [] });
      i += 1;
      continue;
    }
    const firstArgs: number[] = [];
    for (let k = 0; k < arity; k += 1) {
      const value = tokens[i + 1 + k];
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      firstArgs.push(value);
    }
    commands.push({ cmd: token, args: firstArgs });
    i += 1 + arity;
    while (typeof tokens[i] === 'number') {
      const args: number[] = [];
      for (let k = 0; k < arity; k += 1) {
        const value = tokens[i + k];
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        args.push(value);
      }
      const repeated = upper === 'M' ? (token === 'm' ? 'l' : 'L') : token;
      commands.push({ cmd: repeated, args });
      i += arity;
    }
  }
  return commands;
}

function midpoint(a: GeometryPointLike, b: GeometryPointLike): GeometryPointLike {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function polylineLength(a: GeometryPointLike, b: GeometryPointLike, c: GeometryPointLike): number {
  return Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y);
}

/** Adaptive de Casteljau: emit the curve's end point once it is within spacing. */
function sampleCubic(
  p0: GeometryPointLike,
  p1: GeometryPointLike,
  p2: GeometryPointLike,
  p3: GeometryPointLike,
  spacing: number,
  out: GeometryPointLike[],
  depth = 0,
): void {
  if (depth > 20 || polylineLength(p0, p1, p2) + Math.hypot(p3.x - p2.x, p3.y - p2.y) <= spacing) {
    out.push({ x: p3.x, y: p3.y });
    return;
  }
  const p01 = midpoint(p0, p1);
  const p12 = midpoint(p1, p2);
  const p23 = midpoint(p2, p3);
  const p012 = midpoint(p01, p12);
  const p123 = midpoint(p12, p23);
  const mid = midpoint(p012, p123);
  sampleCubic(p0, p01, p012, mid, spacing, out, depth + 1);
  sampleCubic(mid, p123, p23, p3, spacing, out, depth + 1);
}

function sampleQuadratic(
  p0: GeometryPointLike,
  p1: GeometryPointLike,
  p2: GeometryPointLike,
  spacing: number,
  out: GeometryPointLike[],
): void {
  // Elevate the quadratic to a cubic and reuse the adaptive sampler.
  const c1 = { x: p0.x + (2 / 3) * (p1.x - p0.x), y: p0.y + (2 / 3) * (p1.y - p0.y) };
  const c2 = { x: p2.x + (2 / 3) * (p1.x - p2.x), y: p2.y + (2 / 3) * (p1.y - p2.y) };
  sampleCubic(p0, c1, c2, p2, spacing, out);
}

interface ArcCenter {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  phi: number;
  theta1: number;
  deltaTheta: number;
}

/** SVG spec F.6: endpoint parameterisation -> centre parameterisation. */
function arcToCenter(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): ArcCenter | null {
  if (x1 === x2 && y1 === y2) return null;
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return null;
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const numerator = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
  const denominator = rx2 * y1p * y1p + ry2 * x1p * x1p;
  const sign = largeArc !== sweep ? 1 : -1;
  const co = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const theta1 = Math.atan2(uy, ux);
  let deltaTheta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  if (!sweep && deltaTheta > 0) deltaTheta -= 2 * Math.PI;
  if (sweep && deltaTheta < 0) deltaTheta += 2 * Math.PI;

  return { cx, cy, rx, ry, phi, theta1, deltaTheta };
}

function emitArc(point: { x: number; y: number }, arc: ArcCenter, spacing: number, out: GeometryPointLike[]): void {
  const { cx, cy, rx, ry, phi, theta1, deltaTheta } = arc;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const radius = Math.max(rx, ry);
  const steps = Math.max(1, Math.ceil((Math.abs(deltaTheta) * radius) / spacing));
  for (let i = 1; i <= steps; i += 1) {
    const theta = theta1 + (deltaTheta * i) / steps;
    const ex = rx * Math.cos(theta);
    const ey = ry * Math.sin(theta);
    out.push({
      x: cx + cos * ex - sin * ey,
      y: cy + sin * ex + cos * ey,
    });
  }
}

function reflect(point: GeometryPointLike, about: GeometryPointLike): GeometryPointLike {
  return { x: 2 * about.x - point.x, y: 2 * about.y - point.y };
}

/**
 * Parses `d` into one point list per subpath (local user units). Returns null
 * when the data cannot be parsed, so the caller can fall back to the browser.
 */
export function samplePathD(d: string, options: SamplePathOptions = {}): GeometryPointLike[][] | null {
  if (!d || !d.trim()) return null;
  const tokens = tokenize(d);
  if (!tokens) return null;
  const commands = toCommands(tokens);
  if (!commands || commands.length === 0) return null;

  const spacing = options.spacing ?? DEFAULT_SPACING;
  const subpaths: GeometryPointLike[][] = [];
  let current: GeometryPointLike[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let prevCubicControl: GeometryPointLike | null = null;
  let prevQuadControl: GeometryPointLike | null = null;
  let prevWasCubic = false;
  let prevWasQuadratic = false;

  const flush = () => {
    if (current.length > 1) subpaths.push(current);
    else if (current.length === 1) subpaths.push(current);
    current = [];
  };

  for (const { cmd, args } of commands) {
    const upper = cmd.toUpperCase();
    const relative = cmd !== upper;
    if (upper === 'M') {
      flush();
      const x = relative ? cx + args[0] : args[0];
      const y = relative ? cy + args[1] : args[1];
      cx = x;
      cy = y;
      startX = x;
      startY = y;
      current = [{ x, y }];
      prevCubicControl = null;
      prevQuadControl = null;
      prevWasCubic = false;
      prevWasQuadratic = false;
      continue;
    }
    if (upper === 'Z') {
      if (current.length > 0) {
        const last = current[current.length - 1];
        if (last.x !== startX || last.y !== startY) current.push({ x: startX, y: startY });
      }
      cx = startX;
      cy = startY;
      prevCubicControl = null;
      prevQuadControl = null;
      prevWasCubic = false;
      prevWasQuadratic = false;
      continue;
    }

    const from = { x: cx, y: cy };
    let isCubic = false;
    let isQuadratic = false;

    if (upper === 'L') {
      cx = relative ? cx + args[0] : args[0];
      cy = relative ? cy + args[1] : args[1];
      current.push({ x: cx, y: cy });
    } else if (upper === 'H') {
      cx = relative ? cx + args[0] : args[0];
      current.push({ x: cx, y: cy });
    } else if (upper === 'V') {
      cy = relative ? cy + args[0] : args[0];
      current.push({ x: cx, y: cy });
    } else if (upper === 'C' || upper === 'S') {
      let c1: GeometryPointLike;
      let c2: GeometryPointLike;
      let end: GeometryPointLike;
      if (upper === 'C') {
        c1 = { x: relative ? cx + args[0] : args[0], y: relative ? cy + args[1] : args[1] };
        c2 = { x: relative ? cx + args[2] : args[2], y: relative ? cy + args[3] : args[3] };
        end = { x: relative ? cx + args[4] : args[4], y: relative ? cy + args[5] : args[5] };
      } else {
        c1 = prevWasCubic && prevCubicControl ? reflect(prevCubicControl, from) : from;
        c2 = { x: relative ? cx + args[0] : args[0], y: relative ? cy + args[1] : args[1] };
        end = { x: relative ? cx + args[2] : args[2], y: relative ? cy + args[3] : args[3] };
      }
      sampleCubic(from, c1, c2, end, spacing, current);
      cx = end.x;
      cy = end.y;
      prevCubicControl = c2;
      isCubic = true;
    } else if (upper === 'Q' || upper === 'T') {
      let control: GeometryPointLike;
      let end: GeometryPointLike;
      if (upper === 'Q') {
        control = { x: relative ? cx + args[0] : args[0], y: relative ? cy + args[1] : args[1] };
        end = { x: relative ? cx + args[2] : args[2], y: relative ? cy + args[3] : args[3] };
      } else {
        control = prevWasQuadratic && prevQuadControl ? reflect(prevQuadControl, from) : from;
        end = { x: relative ? cx + args[0] : args[0], y: relative ? cy + args[1] : args[1] };
      }
      sampleQuadratic(from, control, end, spacing, current);
      cx = end.x;
      cy = end.y;
      prevQuadControl = control;
      isQuadratic = true;
    } else if (upper === 'A') {
      const rx = args[0];
      const ry = args[1];
      const rotation = args[2];
      const largeArc = args[3] !== 0;
      const sweep = args[4] !== 0;
      const end = { x: relative ? cx + args[5] : args[5], y: relative ? cy + args[6] : args[6] };
      const arc = arcToCenter(from.x, from.y, rx, ry, rotation, largeArc, sweep, end.x, end.y);
      if (arc) emitArc(end, arc, spacing, current);
      else current.push({ x: end.x, y: end.y });
      cx = end.x;
      cy = end.y;
    } else {
      return null;
    }

    prevWasCubic = isCubic;
    prevWasQuadratic = isQuadratic;
    if (!isCubic) prevCubicControl = null;
    if (!isQuadratic) prevQuadControl = null;
  }
  flush();
  return subpaths;
}
