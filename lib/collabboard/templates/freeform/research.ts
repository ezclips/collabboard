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
  summary:
    'Read PDFs beside your board, turn passages into linked Notes, and pull it together with Board AI and the Board Wiki.',
  contents: [
    'A drop zone for your PDFs in the middle',
    'The PDF opens beside the board: a selected passage or area becomes a Note linked to its page',
    'Research question, findings and a sources table',
    'Board AI opens on the right and answers with page numbers',
    'Save answers to the Board Wiki, as pages that list their sources',
  ],
  posts: [
    { kind: 'column', key: 'question', title: 'Your question', x: 60, y: 60, width: 360, height: 1100, topStrip: '#6366f1' },
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
      title: 'Read it beside your board',
      html: '<p><strong>Read it beside your board</strong></p><ol><li>On the PDF card, press <strong>Add to side panel</strong>. Its pages open next to the board.</li><li>Select a sentence and press <strong>Save as Note</strong>. The Note links back to its page.</li><li>Press <strong>Select area</strong>, frame a chart or a picture, then press <strong>Create Note from area</strong>.</li><li>Drag your Notes into Findings. The reader’s <strong>Library</strong> keeps every Note, image and highlight of that PDF.</li></ol>',
      x: 470,
      y: 670,
      width: 560,
      height: 240,
    },

    {
      kind: 'note',
      title: 'Ask Board AI, keep it in the wiki',
      html: '<p><strong>Ask Board AI</strong> — it is open on the right.</p><ul><li>“Summarise this PDF in five points.”</li><li>“What evidence answers my question?”</li><li>“Find quotes about …, with page numbers.”</li></ul><p>Answers name their pages. <strong>Save as Note</strong> puts an answer on the board; <strong>Save to wiki</strong> keeps it in the <strong>Board Wiki</strong>, as a page that lists its sources.</p>',
      x: 470,
      y: 930,
      width: 560,
      height: 230,
    },

    { kind: 'column', key: 'findings', title: 'Findings', x: 1080, y: 60, width: 360, height: 1100, topStrip: '#10b981' },
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
      rows: [
        ['Title', 'Author', 'Year'],
        ['Your first PDF', '', ''],
        ['', '', ''],
        ['', '', ''],
      ],
      parent: 'findings',
    },
  ],
};
