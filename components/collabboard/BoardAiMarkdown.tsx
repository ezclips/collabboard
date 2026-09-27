'use client';

import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';

/**
 * PATCH-203. A board-AI answer is Markdown, and it used to be printed raw, so
 * `**1.d4**` reached the reader with its asterisks. This renders an assistant
 * turn as compact, chat-sized Markdown.
 *
 * SAFE BY DEFAULT, ON PURPOSE. There is no `rehype-raw` and there must never be
 * one: without it react-markdown does not render raw HTML, so an answer cannot
 * introduce markup. The default `urlTransform` likewise drops `javascript:`
 * and other unsafe URLs. Only assistant turns come through here -- what the
 * person typed is text, not Markdown -- and the raw Markdown is what Save as
 * Note / Save to wiki still receive.
 */
const markdownComponents: Components = {
  // Paragraphs carry the spacing; the bubble no longer relies on pre-wrap.
  p: ({ node, ...props }) => <p className="mb-1.5 last:mb-0" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
  em: ({ node, ...props }) => <em className="italic" {...props} />,
  ul: ({ node, ...props }) => <ul className="mb-1.5 list-disc pl-4 last:mb-0" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-1.5 list-decimal pl-4 last:mb-0" {...props} />,
  li: ({ node, ...props }) => <li className="mb-0.5 last:mb-0" {...props} />,
  // Never large: a heading in a chat bubble is a label, not a title.
  h1: ({ node, ...props }) => <h1 className="mb-1 mt-2 text-xs font-semibold first:mt-0" {...props} />,
  h2: ({ node, ...props }) => <h2 className="mb-1 mt-2 text-xs font-semibold first:mt-0" {...props} />,
  h3: ({ node, ...props }) => <h3 className="mb-1 mt-2 text-xs font-semibold first:mt-0" {...props} />,
  h4: ({ node, ...props }) => <h4 className="mb-1 mt-2 text-xs font-semibold first:mt-0" {...props} />,
  code: ({ node, ...props }) => (
    <code className="rounded bg-gray-200/70 px-1 py-0.5 font-mono text-[10px]" {...props} />
  ),
  pre: ({ node, ...props }) => (
    <pre className="mb-1.5 overflow-x-auto rounded bg-gray-200/70 p-1.5 font-mono text-[10px] last:mb-0" {...props} />
  ),
  a: ({ node, ...props }) => (
    <a
      className="text-blue-700 underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote className="mb-1.5 border-l-2 border-gray-300 pl-2 text-gray-600 last:mb-0" {...props} />
  ),
  hr: ({ node, ...props }) => <hr className="my-2 border-gray-300" {...props} />,
};

export default function BoardAiMarkdown({ content }: { readonly content: string }) {
  return <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>;
}
