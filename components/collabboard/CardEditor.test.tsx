import fs from 'node:fs';
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

function renderClipart(readOnly: boolean, title = 'Rocket') {
  return renderToStaticMarkup(
    <CardEditor
      isOpen
      onClose={() => {}}
      title={title}
      initialContent="Clipart body content"
      initialMetadata={{ svgUrl: 'https://cdn.example.com/icons/rocket.svg', iconBgColor: '#ec4899' }}
      onSave={() => {}}
      readOnly={readOnly}
    />,
  );
}

describe('CardEditor read-only clipart-card rendering (PATCH-151)', () => {
  const markup = renderClipart(true);

  it('renders the clipart image and content on the initial render, without relying on an effect', () => {
    expect(markup).toMatch(/<img[^>]*src="https:\/\/cdn\.example\.com\/icons\/rocket\.svg"/);
    expect(markup).toContain('Clipart body content');
  });

  it('renders the existing title, falling back to "View Document" when empty', () => {
    expect(markup).toContain('Rocket');
    expect(renderClipart(true, '')).toContain('View Document');
  });

  it('has no editing surface: no title input, no toolbar, no footer', () => {
    expect(markup).not.toMatch(/<input/);
    expect(markup).not.toContain('Start writing...');
    expect(markup).not.toContain('Add a description...');
  });

  it('exposes exactly one control: an accessible close button', () => {
    expect((markup.match(/<button/g) || []).length).toBe(1);
    expect(markup).toMatch(/<button[^>]*aria-label="Close"/);
  });
});

it('CardEditor retains the readOnly save short-circuit in source (PATCH-151 negative control)', () => {
  expect(fs.readFileSync('components/collabboard/CardEditor.tsx', 'utf8')).toContain('if (readOnly) {');
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
