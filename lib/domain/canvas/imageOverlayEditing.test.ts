import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hasImagePostDrawingOverlay,
  resolveImagePostDisplaySrc,
} from './imagePostDisplaySource';
import {
  EMPTY_TEXT_ANNOTATION_PLACEHOLDER,
  MIN_TEXT_ANNOTATION_BOX_WIDTH,
  measureTextAnnotationBox,
} from './imageTextAnnotationBox';

/**
 * R6D -- Draw-on-top preview, default colour, and text box geometry.
 *
 * Everything here is the POLICY, isolated from React and from a real 2D
 * canvas: the editor supplies the measurement, these decide the outcome.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const drawingLayer = read('components/collabboard/editors/ImageDrawingLayer.tsx');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');

const BASE = 'https://cdn.test/base.png';
const COMPOSITE = 'data:image/png;base64,COMPOSITE';
const PRIVATE_ROUTE = '/api/boards/b/padlets/p/image';

describe('D1-D6: a saved drawing is what the post looks like', () => {
  it('D1,D2: the flattened composite wins over the base image', () => {
    // The bug: this list used to start with imageUrl, which is always present,
    // so the composite was unreachable and the modal showed only the base.
    expect(resolveImagePostDisplaySrc({ metadata: { imageUrl: BASE, drawing: COMPOSITE } })).toBe(COMPOSITE);
    expect(hasImagePostDrawingOverlay({ metadata: { imageUrl: BASE, drawing: COMPOSITE } })).toBe(true);
  });

  it('D3: a post with no drawing is completely unaffected', () => {
    expect(resolveImagePostDisplaySrc({ metadata: { imageUrl: BASE } })).toBe(BASE);
    expect(hasImagePostDrawingOverlay({ metadata: { imageUrl: BASE } })).toBe(false);
  });

  it('D4: the card and the modal now read ONE authority, so they cannot drift', () => {
    // They previously ordered the same two fields differently, which is exactly
    // how a drawing became visible in one place and invisible in the other.
    expect((freeform.match(/resolveImagePostDisplaySrc\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(freeform).not.toContain('padlet.metadata?.drawing || padlet.metadata?.imageUrl');
    expect(freeform).not.toContain('activeImageToolbarPadlet.metadata?.imageUrl ||');
  });

  it('D5: EDITING still starts from the base image, never the composite', () => {
    // Drawing on top of an already-flattened composite would bake every pass
    // in permanently. The draw/crop editors keep taking metadata.imageUrl.
    expect(canvasClient).toContain("imageUrl={drawingPadlet.metadata?.imageUrl || ''}");
    // ...and the shared DISPLAY helper is deliberately not used there.
    const drawWiring = canvasClient.slice(canvasClient.indexOf('<ImageDrawingLayer'));
    expect(drawWiring.slice(0, 400)).not.toContain('resolveImagePostDisplaySrc');
  });

  it('D6: the fallback chain below the composite keeps its original order', () => {
    expect(resolveImagePostDisplaySrc({ metadata: { fileUrl: BASE } })).toBe(BASE);
    expect(resolveImagePostDisplaySrc({ file_url: BASE })).toBe(BASE);
    expect(resolveImagePostDisplaySrc({ content: BASE })).toBe(BASE);
    // A bare non-URL body is not an image.
    expect(resolveImagePostDisplaySrc({ content: 'just text' })).toBeNull();
    expect(resolveImagePostDisplaySrc(null)).toBeNull();
    expect(resolveImagePostDisplaySrc({ metadata: { imageUrl: '   ' } })).toBeNull();
  });

  it('a private R6B image is displayed through its authenticated route, unchanged', () => {
    expect(resolveImagePostDisplaySrc({ metadata: { imageUrl: PRIVATE_ROUTE } })).toBe(PRIVATE_ROUTE);
    // No public URL, bucket or Storage path is ever synthesised here.
    for (const forbidden of ['getPublicUrl', 'createSignedUrl', 'padlet-files', 'storage/v1']) {
      expect(read('lib/domain/canvas/imagePostDisplaySource.ts'), forbidden).not.toContain(forbidden);
    }
  });
});

describe('D7-D12: the default drawing colour is red', () => {
  it('D7,D8: a fresh session starts on the palette red, not white', () => {
    expect(drawingLayer).toContain("export const DEFAULT_DRAWING_COLOR = '#ef4444';");
    expect(drawingLayer).toContain('useState(DEFAULT_DRAWING_COLOR)');
    expect(drawingLayer).not.toContain("const [color, setColor] = useState('#ffffff')");
  });

  it('D9,D10,D11: the picker is untouched -- every colour, white included, still selectable', () => {
    // Only the initial value changed; the control and its palette are the same.
    expect(drawingLayer).toContain('<DrawingColorPopup color={color} onSelect={setColor}>');
    const palette = read('components/collabboard/editors/DrawingPopups.tsx');
    expect(palette).toContain("'#ef4444'");
    expect(palette).toContain("'#ffffff'");
  });

  it('D12: nothing rewrites already-saved colours', () => {
    // The default is a useState seed. There is no migration, no normalisation
    // of loaded paths, and text colour keeps its own separate default.
    expect(drawingLayer).toContain("const [textColor, setTextColor] = useState('#ffffff')");
    expect(drawingLayer).not.toMatch(/initialPaths[\s\S]{0,200}(#ef4444|DEFAULT_DRAWING_COLOR)/);
  });
});

describe('D13-D19: a new text annotation is horizontal', () => {
  /** A believable monospace-ish measurer: 0.5em per character. */
  const measure = (fontSize: number) => (line: string) => line.length * fontSize * 0.5;

  it('D13,D14: an empty box is sized to the placeholder it displays', () => {
    const box = measureTextAnnotationBox('', 24, measure(24));
    // Before R6D an empty box measured a single space -> the 50px floor -> about
    // 22px of content box -> "Type here..." wrapped one character per line.
    expect(box.boxWidth).toBeGreaterThan(MIN_TEXT_ANNOTATION_BOX_WIDTH * 2);
    const placeholderWidth = EMPTY_TEXT_ANNOTATION_PLACEHOLDER.length * 24 * 0.5;
    expect(box.boxWidth).toBeCloseTo(placeholderWidth + 24, 5);
    // Wide enough that the placeholder fits on one line, which is the whole point.
    expect(box.boxWidth - 24).toBeGreaterThanOrEqual(placeholderWidth);
  });

  it('D13b: the placeholder never becomes content -- it is width only', () => {
    // `lines` is painted onto the saved canvas by handleSave. If the
    // placeholder reached it, every empty annotation would be saved reading
    // "Type here...".
    const box = measureTextAnnotationBox('', 24, measure(24));
    expect(box.lines).toEqual(['']);
    expect(box.lines.join('')).not.toContain('Type here');
    expect(box.boxHeight).toBeCloseTo(24 * 1.2 + 24, 5);
  });

  it('D15: a longer phrase measures wider, so it starts horizontal and wraps by width', () => {
    const phrase = 'This is a text annotation';
    const box = measureTextAnnotationBox(phrase, 24, measure(24));
    expect(box.boxWidth).toBeCloseTo(phrase.length * 12 + 24, 5);
    expect(box.boxWidth).toBeGreaterThan(measureTextAnnotationBox('', 24, measure(24)).boxWidth);
    // One line of content: wrapping is the textarea's own soft wrap against
    // the clamped width, not a newline inserted here.
    expect(box.lines).toHaveLength(1);
  });

  it('D17: multiline content still grows in height and takes its widest line', () => {
    const box = measureTextAnnotationBox('ab\nabcdef\nabc', 20, measure(20));
    expect(box.lines).toEqual(['ab', 'abcdef', 'abc']);
    expect(box.boxWidth).toBeCloseTo(6 * 10 + 24, 5);
    expect(box.boxHeight).toBeCloseTo(3 * 24 + 24, 5);
  });

  it('D17b: a width cap wraps live text onto multiple rendered lines', () => {
    const box = measureTextAnnotationBox('Hello World', 24, measure(24), 80);
    expect(box.lines.length).toBeGreaterThan(1);
    expect(box.lines.join('').replace(/\s/g, '')).toBe('HelloWorld');
    expect(box.boxWidth).toBe(80);
    expect(box.boxHeight).toBeCloseTo(4 * (24 * 1.2) + 24, 5);
  });

  it('D19: EXISTING saved text keeps exactly the geometry it had', () => {
    // The only behaviour that changed is the empty case. Any content string
    // still goes through the untouched max(50, measured + padding) formula.
    for (const content of ['a', 'Hello', 'A somewhat longer caption', 'x\ny']) {
      const widest = content.split('\n').reduce((w, l) => Math.max(w, l.length * 8), 0);
      expect(measureTextAnnotationBox(content, 16, measure(16)).boxWidth, content)
        .toBeCloseTo(Math.max(MIN_TEXT_ANNOTATION_BOX_WIDTH, widest + 24), 5);
    }
  });

  it('the floor still guards a font that has not loaded, and a broken measurer', () => {
    expect(measureTextAnnotationBox('hello', 16, () => 0).boxWidth).toBe(MIN_TEXT_ANNOTATION_BOX_WIDTH);
    expect(measureTextAnnotationBox('hello', 16, () => Number.NaN).boxWidth).toBe(MIN_TEXT_ANNOTATION_BOX_WIDTH);
  });

  it('D16,D18: the editor and the saved canvas read the SAME box', () => {
    // One helper, called once per element per render, feeding both the
    // textarea's width/height and handleSave's canvas geometry.
    expect(drawingLayer).toContain('measureTextBox(text.content, text.fontSize, maxAllowedWidth)');
    expect(drawingLayer).toContain('measureTextBox(el.content, el.fontSize, maxAllowedWidth)');
    // Exactly two consumers: the textarea's width/height, and handleSave's
    // canvas geometry. Neither may grow its own second measurement.
    expect((drawingLayer.match(/measureTextBox\(/g) ?? []).length).toBe(2);
    expect(drawingLayer).toContain('placeholder={EMPTY_TEXT_ANNOTATION_PLACEHOLDER}');
    // No global nowrap: multiline must stay possible.
    expect(drawingLayer).not.toContain('whiteSpace: \'nowrap\'');
    expect(drawingLayer).not.toContain('white-space: nowrap');
  });
});
