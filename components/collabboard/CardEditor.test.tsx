import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CardEditor from './CardEditor';

function renderMode(readOnly: boolean) {
  return renderToStaticMarkup(
    <CardEditor
      isOpen
      onClose={() => {}}
      title="Card title"
      initialContent="Card body content"
      initialMetadata={{ description: 'A description' }}
      onSave={() => {}}
      readOnly={readOnly}
    />,
  );
}

describe('CardEditor read-only viewer route (PATCH-139)', () => {
  const markup = renderMode(true);

  it('renders the content', () => {
    expect(markup).toContain('Card body content');
  });

  it('has no editable title input', () => {
    expect(markup).not.toMatch(/<input/);
  });

  it('has no formatting toolbar', () => {
    expect(markup).not.toContain('Start writing...');
  });

  it('has no save/footer controls', () => {
    expect(markup).not.toContain('Add a description...');
  });

  it('renders content as readonly', () => {
    expect(markup).toMatch(/<textarea[^>]*readonly/i);
  });

  it('exposes exactly one control: the close button', () => {
    expect((markup.match(/<button/g) || []).length).toBe(1);
  });

  it('gives the close button an accessible name', () => {
    expect(markup).toMatch(/<button[^>]*aria-label="Close"/);
  });
});

describe('CardEditor editable route (PATCH-139)', () => {
  const markup = renderMode(false);

  it('retains the formatting toolbar', () => {
    expect(markup).toContain('Start writing...');
  });

  it('retains an editable content area', () => {
    expect(markup).not.toMatch(/<textarea[^>]*readonly/i);
  });

  it('retains the footer', () => {
    expect(markup).toContain('Add a description...');
  });

  it('gives the close button an accessible name', () => {
    expect(markup).toMatch(/<button[^>]*aria-label="Close"/);
  });
});
