import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-302. The first freeform template: a research board whose middle is a
 * PDF drop zone. Every asset lives under `/templates/freeform/research/` and
 * has an entry in that folder's `credits.json`.
 */
export const RESEARCH: BoardTemplate = {
  id: 'research',
  name: 'Research',
  layout: 'freeform',
  previewUrl: '/templates/freeform/research/preview.jpg',
  openBoardAiAfterApply: true,
  summary: 'Upload a PDF and explore it with Board AI.',
  contents: [
    'A drop zone for your PDFs in the middle',
    'Research question and key findings',
    'Sources table and open questions',
    'Board AI opens with the board',
  ],
  posts: [
    { kind: 'column', key: 'question', title: 'Your question', x: 60, y: 60, width: 360, height: 820, topStrip: '#6366f1' },
    { kind: 'clipart', title: 'Question', svg: '/templates/freeform/research/magnifier.svg', iconBgColor: '#c7d2fe', parent: 'question' },
    {
      kind: 'note',
      title: 'Research question',
      html: '<p><strong>Research question</strong></p><p>What do you want to find out? Write it as one clear question.</p><p><em>Example: How does sleep affect how well students remember what they learn?</em></p>',
      parent: 'question',
    },
    {
      kind: 'note',
      title: 'Why it matters',
      html: '<p><strong>Why it matters</strong></p><ul><li>Who is affected?</li><li>What will you do with the answer?</li><li>What do you already know?</li></ul>',
      parent: 'question',
    },
    { kind: 'image', title: 'Where the sources are', src: '/templates/freeform/research/library-reading-room.jpg', parent: 'question' },

    { kind: 'image', title: 'Read, mark, collect', src: '/templates/freeform/research/highlighting.jpg', x: 470, y: 60, width: 560, height: 220 },

    {
      kind: 'upload',
      title: 'Upload your research',
      html: '<p><strong>Upload your research</strong></p><p>Drop a PDF here or choose a file. It lands on this board, and Board AI can read it with you.</p>',
      x: 470,
      y: 300,
      width: 560,
      height: 340,
    },

    {
      kind: 'note',
      title: 'Ask Board AI',
      html: '<p><strong>Ask Board AI</strong> — it opens on the right.</p><ul><li>“Summarise this PDF in five points.”</li><li>“What evidence answers my question?”</li><li>“Which sources does it cite?”</li><li>“Find quotes about …, with page numbers.”</li></ul>',
      x: 470,
      y: 670,
      width: 560,
      height: 210,
    },

    { kind: 'column', key: 'findings', title: 'Findings', x: 1080, y: 60, width: 360, height: 820, topStrip: '#10b981' },
    { kind: 'clipart', title: 'Findings', svg: '/templates/freeform/research/light-bulb.svg', iconBgColor: '#bbf7d0', parent: 'findings' },
    {
      kind: 'todo',
      title: 'Key findings',
      tasks: [
        { text: 'Finding 1 — note the page', done: false },
        { text: 'Finding 2 — note the page', done: false },
        { text: 'Finding 3 — note the page', done: false },
      ],
      parent: 'findings',
    },
    {
      kind: 'note',
      title: 'Quotes and evidence',
      html: '<p><strong>Quotes and evidence</strong></p><blockquote>“Paste a quote here.” — Author, p. 12</blockquote>',
      parent: 'findings',
    },
    { kind: 'clipart', title: 'Open questions', svg: '/templates/freeform/research/bookmark-tabs.svg', iconBgColor: '#fde68a', parent: 'findings' },
    {
      kind: 'todo',
      title: 'Open questions',
      tasks: [
        { text: 'What is still unclear?', done: false },
        { text: 'What should I read next?', done: false },
      ],
      parent: 'findings',
    },

    {
      kind: 'table',
      title: 'Sources',
      x: 1490,
      y: 60,
      width: 440,
      height: 220,
      rows: [
        ['Title', 'Author', 'Year'],
        ['Your first PDF', '', ''],
        ['', '', ''],
        ['', '', ''],
      ],
    },
    { kind: 'image', title: 'Taking notes', src: '/templates/freeform/research/taking-notes.jpg', x: 1490, y: 310, width: 440, height: 294 },
    { kind: 'clipart', title: 'Reading list', svg: '/templates/freeform/research/books.svg', iconBgColor: '#fecaca', x: 1490, y: 640 },
    { kind: 'clipart', title: 'Ask Board AI', svg: '/templates/freeform/research/speech-balloon.svg', iconBgColor: '#bfdbfe', x: 1700, y: 640 },
  ],
};
