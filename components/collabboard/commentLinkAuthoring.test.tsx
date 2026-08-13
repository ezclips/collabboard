// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { createCommentLinkExtension, normalizeCommentLinkUrl, applyCommentLink } from './commentLinkAuthoring';

function makeEditor(content = '<p>hello world</p>') {
  return new Editor({
    extensions: [StarterKit.configure({ link: false }), createCommentLinkExtension()],
    content,
  });
}

describe('normalizeCommentLinkUrl', () => {
  it('prefixes a bare domain with https://', () => {
    expect(normalizeCommentLinkUrl('example.com')).toBe('https://example.com');
  });

  it('preserves an explicit https:// URL', () => {
    expect(normalizeCommentLinkUrl('https://example.com')).toBe('https://example.com');
  });

  it('preserves an explicit http:// URL', () => {
    expect(normalizeCommentLinkUrl('http://example.com')).toBe('http://example.com');
  });
});

describe('applyCommentLink', () => {
  it('applies a Link mark to a selected range', () => {
    const editor = makeEditor('<p>hello world</p>');
    // "hello" occupies doc positions 1-6.
    applyCommentLink(editor, 'example.com', { from: 1, to: 6 });
    expect(editor.getHTML()).toContain('href="https://example.com"');
    expect(editor.getHTML()).toContain('hello');
    editor.destroy();
  });

  it('updates an existing link href on the same range', () => {
    const editor = makeEditor('<p>hello world</p>');
    applyCommentLink(editor, 'example.com', { from: 1, to: 6 });
    applyCommentLink(editor, 'other.com', { from: 1, to: 6 });
    expect(editor.getHTML()).toContain('href="https://other.com"');
    expect(editor.getHTML()).not.toContain('href="https://example.com"');
    editor.destroy();
  });

  it('removes the Link mark when the url is empty, preserving the text', () => {
    const editor = makeEditor('<p>hello world</p>');
    applyCommentLink(editor, 'example.com', { from: 1, to: 6 });
    expect(editor.getHTML()).toContain('href="https://example.com"');
    applyCommentLink(editor, '', { from: 1, to: 6 });
    expect(editor.getHTML()).not.toContain('<a ');
    expect(editor.getHTML()).toContain('hello');
    editor.destroy();
  });

  it('inserts the URL as linked text at a collapsed selection instead of silently no-oping', () => {
    const editor = makeEditor('<p></p>');
    applyCommentLink(editor, 'example.com', { from: 1, to: 1 });
    expect(editor.getHTML()).toContain('href="https://example.com"');
    expect(editor.getHTML()).toContain('example.com');
    editor.destroy();
  });

  it('does not carry the Link mark into text typed immediately after a collapsed-selection insert', () => {
    const editor = makeEditor('<p></p>');
    applyCommentLink(editor, 'example.com', { from: 1, to: 1 });
    editor.commands.insertContent('more');
    const html = editor.getHTML();
    expect(html).toContain('>example.com</a>more');
    expect(html.match(/<a /g)).toHaveLength(1);
    editor.destroy();
  });
});
