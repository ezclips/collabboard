// @vitest-environment jsdom
// PATCH-149B1a self-correction: the `dompurify` package requires a real DOM
// (`DOMPurify.sanitize is not a function` under plain Node — verified),
// so this adapter test uses the already-approved B0 jsdom harness rather
// than mocking away the real sanitization call.
import { describe, expect, it } from 'vitest';
import {
  classifyDocumentContent,
  toEditorHtml,
  fromEditorHtml,
} from './documentContentAdapter';

// Synthetic fixtures matching the measured corpus shapes (PATCH-149.md §19.2)
// — no real user content.
const SYNTHETIC_MALFORMED = 'Line one <not a tag\n\nLine two > also not one\n'.repeat(40);

describe('classifyDocumentContent', () => {
  it('classifies null/undefined/empty/whitespace as empty', () => {
    expect(classifyDocumentContent(null)).toBe('empty');
    expect(classifyDocumentContent(undefined)).toBe('empty');
    expect(classifyDocumentContent('')).toBe('empty');
    expect(classifyDocumentContent('   \n  ')).toBe('empty');
  });

  it('classifies ordinary prose as plain-text', () => {
    expect(classifyDocumentContent('Just a note about the meeting.')).toBe('plain-text');
  });

  it('classifies real supported markup as html', () => {
    expect(classifyDocumentContent('<p>Hello <strong>world</strong></p>')).toBe('html');
  });

  it('classifies bare angle brackets with no real tag as malformed', () => {
    expect(classifyDocumentContent(SYNTHETIC_MALFORMED)).toBe('malformed');
    expect(classifyDocumentContent('a < b and c > d')).toBe('malformed');
  });
});

describe('toEditorHtml', () => {
  it('initializes empty/null content safely', () => {
    expect(toEditorHtml(null)).toBe('');
    expect(toEditorHtml('')).toBe('');
  });

  it('keeps simple plain text visible as escaped paragraph HTML', () => {
    expect(toEditorHtml('hello world')).toBe('<p>hello world</p>');
  });

  it('escapes special characters instead of interpreting them', () => {
    const out = toEditorHtml('<script>alert(1)</script> & "quoted"');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;quoted&quot;');
  });

  it('preserves multiple newlines predictably (paragraphs + line breaks)', () => {
    const out = toEditorHtml('line1\nline2\n\nsecond para');
    expect(out).toBe('<p>line1<br>line2</p><p>second para</p>');
  });

  it('keeps a long malformed-HTML-like fixture fully visible, never swallowed', () => {
    const out = toEditorHtml(SYNTHETIC_MALFORMED);
    expect(out).toContain('&lt;not a tag');
    expect(out).toContain('Line two &gt; also not one');
    expect(out.length).toBeGreaterThan(SYNTHETIC_MALFORMED.length * 0.9);
  });

  it('falls back malformed tags to escaped text rather than dropping them', () => {
    const out = toEditorHtml('price < 5 and weight > 10');
    expect(out).toContain('&lt;');
    expect(out).toContain('&gt;');
    expect(out).not.toMatch(/<(?!p|br)[a-z]/i);
  });

  it('does not swallow HTML-looking plain text lacking real tags', () => {
    const out = toEditorHtml('Use <example> as a placeholder');
    expect(out).toContain('Use &lt;example&gt; as a placeholder');
  });

  it('renders valid supported HTML as markup, not raw escaped tags', () => {
    const out = toEditorHtml('<p>Hello <strong>world</strong></p>');
    expect(out).toContain('<strong>world</strong>');
    expect(out).not.toContain('&lt;strong&gt;');
  });

  it('preserves custom data-* attributes through supported-HTML normalization', () => {
    const out = toEditorHtml('<span data-comment-id="c1" data-color="#fff">hi</span>');
    expect(out).toContain('data-comment-id="c1"');
    expect(out).toContain('data-color="#fff"');
  });

  it('strips unsafe script content while preserving surrounding text', () => {
    const out = toEditorHtml('<p>safe</p><script>alert(1)</script>');
    expect(out).toContain('safe');
    expect(out).not.toContain('<script>');
  });

  it('embeds no title or metadata into the body HTML', () => {
    const out = toEditorHtml('plain body text');
    expect(out).not.toContain('title');
    expect(out).not.toContain('metadata');
  });

  it('is deterministic and does not mutate its input', () => {
    const input = 'stable & <b>text</b>';
    const first = toEditorHtml(input);
    const second = toEditorHtml(input);
    expect(first).toBe(second);
    expect(input).toBe('stable & <b>text</b>');
  });
});

function visibleText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

describe('F2: mixed/ambiguous content fails safe (PATCH-149 §20.15)', () => {
  it('classifies mixed valid-tag + unsupported-tag input as non-html and preserves every visible character', () => {
    const input = 'Use <example> as a placeholder <p>and real markup</p>';
    expect(classifyDocumentContent(input)).not.toBe('html');
    const text = visibleText(toEditorHtml(input));
    expect(text).toContain('example');
    expect(text).toContain('as a placeholder');
    expect(text).toContain('and real markup');
    expect(input).toBe('Use <example> as a placeholder <p>and real markup</p>');
  });

  it('does not lose text for an unclosed supported tag, or comparison-operator brackets', () => {
    expect(visibleText(toEditorHtml('<p>Open paragraph'))).toContain('Open paragraph');
    expect(visibleText(toEditorHtml('x < y && y > z'))).toContain('x < y && y > z');
  });
});

describe('fromEditorHtml', () => {
  it('normalizes an empty TipTap document to an empty string', () => {
    expect(fromEditorHtml('<p></p>')).toBe('');
    expect(fromEditorHtml('')).toBe('');
    expect(fromEditorHtml(null)).toBe('');
    expect(fromEditorHtml(undefined)).toBe('');
  });

  it('trims surrounding whitespace while preserving supported markup', () => {
    expect(fromEditorHtml('  <p>hi</p>  ')).toBe('<p>hi</p>');
  });
});
