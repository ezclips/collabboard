import type {
  AIContentData,
  AIMode,
  AIContentEnvelope,
  DiagramSubtype,
  LegacyHTMLContent,
  LoadedAIContent,
  StoredAIContent,
} from '@/lib/ai/contracts';
import { trackAIUnsupportedVersion } from '@/lib/ai/telemetry';
import { DIAGRAM_SUBTYPE_SCHEMAS, safeValidateStoredAIContent } from '@/lib/ai/validators';

export const CURRENT_AI_CONTENT_VERSION = 1 as const;

type AIContentMeta = AIContentEnvelope<AIContentData>['meta'];

export type DeserializedPersistedAIContent =
  | { kind: 'structured'; envelope: StoredAIContent }
  | { kind: 'legacy'; content: LoadedAIContent }
  | { kind: 'unsupported_version'; version: number | null; raw: unknown }
  | { kind: 'unknown'; raw: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAIMode(value: unknown): value is AIMode {
  return typeof value === 'string'
    && ['lesson_board', 'diagram', 'photo_card', 'workshop_board'].includes(value);
}

function inferModeFromData(data: AIContentData): AIMode {
  switch (data.type) {
    case 'lesson_board':
      return 'lesson_board';
    case 'diagram':
      return 'diagram';
    case 'photo':
      return 'photo_card';
    case 'workshop_board':
      return 'workshop_board';
    default:
      return 'lesson_board';
  }
}

export function isLegacyHTMLContent(value: unknown): value is LegacyHTMLContent {
  return isRecord(value) && typeof value.html === 'string';
}

/**
 * PATCH-272. The validated, TRANSFORMED data for a structured value, or null.
 * Unlike the old boolean check, the callers that load/render/save use this so the
 * schema's cleanups (unknown AntV design -> fallback, sanitized element edits,
 * bounded text) actually take effect. This is the STORED path: trusted fields
 * such as `valuesEstimated` survive; example flags are still dropped.
 */
export function parseStructuredAIContentData(value: unknown): AIContentData | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  if (value.type === 'diagram') {
    if (typeof value.subtype !== 'string') {
      return null;
    }

    if (!Object.prototype.hasOwnProperty.call(DIAGRAM_SUBTYPE_SCHEMAS, value.subtype)) {
      return null;
    }

    const result = safeValidateStoredAIContent({
      mode: 'diagram',
      subtype: value.subtype as DiagramSubtype,
      data: value,
    });

    return result.success ? (result.data as AIContentData) : null;
  }

  const modeByType: Record<Exclude<AIContentData['type'], 'diagram'>, Exclude<AIMode, 'diagram'>> = {
    lesson_board: 'lesson_board',
    photo: 'photo_card',
    workshop_board: 'workshop_board',
  };

  if (!(value.type in modeByType)) {
    return null;
  }

  const result = safeValidateStoredAIContent({
    mode: modeByType[value.type as keyof typeof modeByType],
    data: value,
  });

  return result.success ? (result.data as AIContentData) : null;
}

export function isStructuredAIContentData(value: unknown): value is AIContentData {
  return parseStructuredAIContentData(value) !== null;
}

export function getAIContentVersion(value: unknown): number | null {
  if (!isRecord(value) || typeof value.version !== 'number') {
    return null;
  }

  return value.version;
}

export function isSupportedAIContentVersion(version: number | null): version is typeof CURRENT_AI_CONTENT_VERSION {
  return version === CURRENT_AI_CONTENT_VERSION;
}

/**
 * PATCH-272. The envelope with its `data` replaced by the validated, transformed
 * data, or null. `mode`, `version` and `meta` are carried through unchanged.
 */
export function parsePersistedAIContentEnvelope(value: unknown): StoredAIContent | null {
  if (!isRecord(value)) {
    return null;
  }

  const version = getAIContentVersion(value);
  if (!isSupportedAIContentVersion(version) || !isAIMode(value.mode)) {
    return null;
  }

  const data = parseStructuredAIContentData(value.data);
  if (!data) {
    return null;
  }

  return {
    mode: value.mode,
    version: CURRENT_AI_CONTENT_VERSION,
    data,
    meta: value.meta as AIContentMeta | undefined,
  };
}

export function isPersistedAIContentEnvelope(value: unknown): value is StoredAIContent {
  return parsePersistedAIContentEnvelope(value) !== null;
}

export function migrateAIContentEnvelope(value: unknown): DeserializedPersistedAIContent {
  const envelope = parsePersistedAIContentEnvelope(value);
  if (envelope) {
    return {
      kind: 'structured',
      envelope,
    };
  }

  const version = getAIContentVersion(value);
  if (version !== null) {
    trackAIUnsupportedVersion({ version, stage: 'persistence' });
    return {
      kind: 'unsupported_version',
      version,
      raw: value,
    };
  }

  return {
    kind: 'unknown',
    raw: value,
  };
}

export function serializeAIContentEnvelope(input: {
  mode: AIMode;
  data: AIContentData;
  meta?: AIContentMeta;
}): StoredAIContent {
  return {
    mode: input.mode,
    version: CURRENT_AI_CONTENT_VERSION,
    data: input.data,
    meta: input.meta,
  };
}

export function serializeAIContentForPersistence(
  value: unknown,
  options?: {
    mode?: AIMode;
    meta?: AIContentMeta;
  },
): LoadedAIContent | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (isLegacyHTMLContent(value)) {
    return value;
  }

  const envelope = parsePersistedAIContentEnvelope(value);
  if (envelope) {
    return serializeAIContentEnvelope({
      mode: envelope.mode,
      data: envelope.data,
      meta: envelope.meta,
    });
  }

  // PATCH-272. A bare, unversioned structured object keeps today's behaviour:
  // accepted as-is rather than re-validated, so legacy saves are not rewritten.
  if (isStructuredAIContentData(value)) {
    return serializeAIContentEnvelope({
      mode: options?.mode ?? inferModeFromData(value),
      data: value,
      meta: options?.meta,
    });
  }

  return undefined;
}

export function deserializePersistedAIContent(value: unknown): DeserializedPersistedAIContent {
  if (value === undefined || value === null) {
    return {
      kind: 'unknown',
      raw: value,
    };
  }

  if (isLegacyHTMLContent(value)) {
    return {
      kind: 'legacy',
      content: value,
    };
  }

  const migrated = migrateAIContentEnvelope(value);
  if (migrated.kind === 'structured' || migrated.kind === 'unsupported_version') {
    return migrated;
  }

  if (isStructuredAIContentData(value)) {
    return {
      kind: 'legacy',
      content: value as any,
    };
  }

  return {
    kind: 'unknown',
    raw: value,
  };
}
