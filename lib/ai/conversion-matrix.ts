import type { AIMode, DiagramSubtype } from './contracts';

export interface ConversionTarget {
  mode: AIMode;
  subtype?: DiagramSubtype;
  label: string;
}

type ConversionKey = string;

function makeKey(mode: AIMode, subtype?: DiagramSubtype): ConversionKey {
  return subtype ? `${mode}:${subtype}` : mode;
}

// Central compatibility matrix.
// Only explicitly listed pairs are allowed -- no all-to-all conversion.
const CONVERSION_MATRIX: Record<ConversionKey, ConversionTarget[]> = {
  'diagram:flowchart': [
    { mode: 'diagram', subtype: 'mindmap', label: 'Mindmap' },
  ],
  'diagram:mindmap': [
    { mode: 'diagram', subtype: 'flowchart', label: 'Flowchart' },
  ],
  'diagram:pie_chart': [
    { mode: 'diagram', subtype: 'bar_chart', label: 'Bar Chart' },
  ],
  'diagram:bar_chart': [
    { mode: 'diagram', subtype: 'pie_chart', label: 'Pie Chart' },
  ],
};

/** Returns allowed conversion targets for a given source mode/subtype. */
export function getConversionTargets(
  mode: AIMode,
  subtype?: DiagramSubtype,
): ConversionTarget[] {
  return CONVERSION_MATRIX[makeKey(mode, subtype)] ?? [];
}

/** Returns true if the conversion pair is allowed per the matrix. */
export function isConversionAllowed(
  sourceMode: AIMode,
  sourceSubtype: DiagramSubtype | undefined,
  targetMode: AIMode,
  targetSubtype?: DiagramSubtype,
): boolean {
  const targets = getConversionTargets(sourceMode, sourceSubtype);
  return targets.some(
    (t) => t.mode === targetMode && t.subtype === targetSubtype,
  );
}
