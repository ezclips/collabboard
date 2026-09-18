type AITelemetryFields = {
  mode?: string;
  subtype?: string;
  stage?: string;
  reason?: string;
  version?: number | null;
  renderer?: string;
  contentType?: string;
  /** A running total for this process, where a rate matters more than an incident. */
  count?: number;
};

type AITelemetryEvent = AITelemetryFields & {
  event: string;
  timestamp: string;
};

type LogLevel = 'info' | 'warn' | 'error';

function emit(level: LogLevel, event: AITelemetryEvent): void {
  try {
    if (process.env.NODE_ENV === 'production') {
      // No-op for now. Wire to an endpoint here when ready.
      return;
    }

    const { event: name, timestamp, ...fields } = event;
    const parts = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');

    const line = `[ai:telemetry] ${name} ${parts} at=${timestamp}`;

    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.info(line);
    }
  } catch {
    // telemetry must never throw
  }
}

function build(name: string, fields: AITelemetryFields): AITelemetryEvent {
  return { event: name, timestamp: new Date().toISOString(), ...fields };
}

export function trackAIGenerationStarted(fields: {
  mode: string;
  subtype?: string;
}): void {
  emit('info', build('ai_generation_started', fields));
}

export function trackAIGenerationSucceeded(fields: {
  mode: string;
  subtype?: string;
  contentType?: string;
}): void {
  emit('info', build('ai_generation_succeeded', fields));
}

export function trackAIGenerationFailed(fields: {
  mode?: string;
  subtype?: string;
  stage: string;
  reason: string;
}): void {
  emit('error', build('ai_generation_failed', fields));
}

export function trackAIValidationFailed(fields: {
  mode: string;
  subtype?: string;
  reason: string;
}): void {
  emit('warn', build('ai_validation_failed', { ...fields, stage: 'validation' }));
}

export function trackAIEnrichmentFailed(fields: {
  mode: string;
  reason: string;
}): void {
  emit('warn', build('ai_enrichment_failed', { ...fields, stage: 'enrichment' }));
}

export function trackAIRenderFallback(fields: {
  renderer: string;
  reason: string;
  subtype?: string;
}): void {
  emit('warn', build('ai_render_fallback', { ...fields, stage: 'render' }));
}

export function trackAIUnsupportedVersion(fields: {
  version: number | null;
  stage: string;
}): void {
  emit('warn', build('ai_unsupported_version', fields));
}

export function trackAINormalizationUnknownShape(fields: {
  stage: string;
  reason?: string;
}): void {
  emit('warn', build('ai_normalization_unknown_shape', fields));
}

export function trackAIEditOpened(fields: {
  mode: string;
  subtype?: string;
}): void {
  emit('info', build('ai_edit_opened', fields));
}

export function trackAIEditSaved(fields: {
  mode: string;
  subtype?: string;
}): void {
  emit('info', build('ai_edit_saved', fields));
}

export function trackAIEditValidationFailed(fields: {
  mode: string;
  subtype?: string;
  reason: string;
}): void {
  emit('warn', build('ai_edit_validation_failed', { ...fields, stage: 'edit' }));
}

export function trackAIRegenerationStarted(fields: {
  mode: string;
  subtype?: string;
}): void {
  emit('info', build('ai_regeneration_started', fields));
}

export function trackAIRegenerationSucceeded(fields: {
  mode: string;
  subtype?: string;
}): void {
  emit('info', build('ai_regeneration_succeeded', fields));
}

export function trackAIRegenerationFailed(fields: {
  mode: string;
  subtype?: string;
  reason: string;
}): void {
  emit('error', build('ai_regeneration_failed', { ...fields, stage: 'regeneration' }));
}

export function trackAIConversionStarted(fields: {
  sourceMode: string;
  sourceSubtype?: string;
  targetMode: string;
  targetSubtype?: string;
}): void {
  emit('info', build('ai_conversion_started', {
    mode: fields.sourceMode,
    subtype: fields.sourceSubtype,
    contentType: `${fields.targetMode}${fields.targetSubtype ? ':' + fields.targetSubtype : ''}`,
  }));
}

export function trackAIConversionSucceeded(fields: {
  sourceMode: string;
  sourceSubtype?: string;
  targetMode: string;
  targetSubtype?: string;
}): void {
  emit('info', build('ai_conversion_succeeded', {
    mode: fields.sourceMode,
    subtype: fields.sourceSubtype,
    contentType: `${fields.targetMode}${fields.targetSubtype ? ':' + fields.targetSubtype : ''}`,
  }));
}

export function trackAIConversionFailed(fields: {
  sourceMode: string;
  sourceSubtype?: string;
  targetMode: string;
  targetSubtype?: string;
  reason: string;
}): void {
  emit('error', build('ai_conversion_failed', {
    mode: fields.sourceMode,
    subtype: fields.sourceSubtype,
    contentType: `${fields.targetMode}${fields.targetSubtype ? ':' + fields.targetSubtype : ''}`,
    reason: fields.reason,
    stage: 'conversion',
  }));
}

/**
 * Auto mode could not classify the prompt.
 *
 * THIS EVENT EXISTS BECAUSE ITS ABSENCE HID A REAL DEFECT. A failed classify is
 * handled by keeping whatever mode is already selected -- defensible
 * resilience, and completely silent. When the managed default moved to a
 * reasoning model, an 80-token budget left no room for an answer and the
 * classifier failed intermittently; Auto quietly produced the wrong format and
 * nothing anywhere said so. Only a live prompt found it.
 *
 * `stage` separates the two failures, which have different fixes: `provider`
 * means no usable completion came back, `parse` means one did and it was not
 * the expected shape.
 */
export function trackAIClassifyFailed(fields: {
  stage: 'provider' | 'parse';
  reason: string;
  /** Failures since this instance started -- a rate, not just an incident. */
  failureCount: number;
}): void {
  emit('error', build('ai_classify_failed', {
    stage: fields.stage,
    reason: fields.reason,
    count: fields.failureCount,
  }));
}

export function trackAIAutoModeSelected(fields: {
  mode: string;
  subtype?: string;
  confidence: string;
}): void {
  emit('info', build('ai_auto_mode_selected', fields));
}

export function trackAIAutoModeCorrectedByUser(fields: {
  suggestedMode: string;
  suggestedSubtype?: string;
  chosenMode: string;
  chosenSubtype?: string;
}): void {
  emit('info', build('ai_auto_mode_corrected_by_user', {
    mode: fields.suggestedMode,
    subtype: fields.suggestedSubtype,
    contentType: `${fields.chosenMode}${fields.chosenSubtype ? ':' + fields.chosenSubtype : ''}`,
  }));
}
