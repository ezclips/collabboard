import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-293. The first finished freeform template, as data only. Every asset
 * lives under `/templates/freeform/project-plan/` (same-origin static files)
 * and has an entry in that folder's `credits.json`.
 */
export const PROJECT_PLAN: BoardTemplate = {
  id: 'project-plan',
  name: 'Project Plan',
  layout: 'freeform',
  previewUrl: '/templates/freeform/project-plan/preview.jpg',
  summary: 'Goals, milestones and a to-do list.',
  contents: ['Goal and scope notes', 'Milestones with dates', 'A to-do list', 'Reference photos'],
  posts: [
    { kind: 'column', key: 'brief', title: 'Brief', x: 60, y: 60, width: 360, height: 800, topStrip: '#6366f1' },
    {
      kind: 'note',
      title: 'Fern & Fig Café — new website',
      html: '<p><strong>Fern & Fig Café — new website</strong></p><p><strong>Goal:</strong> a warm, simple website with online ordering.</p><ul><li>Show the seasonal menu and the garden terrace</li><li>Order ahead for pick-up</li><li>Launch before the summer season</li></ul><p>⭐ It must feel great on a phone.</p>',
      parent: 'brief',
    },
    { kind: 'clipart', title: 'Goals', svg: '/templates/freeform/project-plan/bullseye.svg', iconBgColor: '#fde68a', parent: 'brief' },
    {
      kind: 'todo',
      title: 'Milestones',
      tasks: [
        { text: 'Kickoff with the owners', done: true },
        { text: 'Collect menu texts and photos', done: true },
        { text: 'Wireframes for five pages', done: false },
        { text: 'Design review with the owners', done: false },
        { text: 'Build online ordering', done: false },
        { text: 'Launch and tell the regulars', done: false },
      ],
      parent: 'brief',
    },
    { kind: 'clipart', title: 'Launch', svg: '/templates/freeform/project-plan/rocket.svg', iconBgColor: '#bfdbfe', parent: 'brief' },

    { kind: 'column', key: 'inspiration', title: 'Inspiration', x: 460, y: 60, width: 360, height: 800, topStrip: '#10b981' },
    { kind: 'image', title: 'Coffee is the star', src: '/templates/freeform/project-plan/latte-art.jpg', parent: 'inspiration' },
    { kind: 'note', title: 'Mood', html: '<p><em>“Warm, green and unhurried — like a Sunday morning.”</em></p>', parent: 'inspiration' },
    { kind: 'image', title: 'The garden terrace', src: '/templates/freeform/project-plan/terrace.jpg', parent: 'inspiration' },
    { kind: 'clipart', title: 'Menu photos', svg: '/templates/freeform/project-plan/hot-beverage.svg', iconBgColor: '#fed7aa', parent: 'inspiration' },

    { kind: 'column', key: 'design', title: 'Design', x: 860, y: 60, width: 360, height: 800, topStrip: '#ec4899' },
    { kind: 'image', title: 'Order page draft', src: '/templates/freeform/project-plan/website-laptop.jpg', parent: 'design' },
    {
      kind: 'note',
      title: 'Colours & type',
      html: '<ul><li>Fern green #2F5D3A</li><li>Fig plum #6B3E5E</li><li>Cream #F6F1E7</li></ul><p>A friendly serif for headings, a clean sans for text.</p>',
      parent: 'design',
    },
    { kind: 'clipart', title: 'Brand kit', svg: '/templates/freeform/project-plan/artist-palette.svg', iconBgColor: '#fbcfe8', parent: 'design' },
    { kind: 'image', title: 'Team portraits', src: '/templates/freeform/project-plan/barista.jpg', parent: 'design' },

    { kind: 'image', title: 'Fern & Fig Café', src: '/templates/freeform/project-plan/cafe-plants.jpg', x: 1260, y: 60, width: 440, height: 294 },
    {
      kind: 'table',
      title: 'Budget',
      x: 1260,
      y: 400,
      width: 440,
      height: 240,
      rows: [
        ['Phase', 'Hours', 'Cost'],
        ['Discovery & content', '10', '$900'],
        ['Design (five pages)', '24', '$2,160'],
        ['Build & online ordering', '40', '$3,600'],
        ['Launch & training', '6', '$540'],
        ['Total', '80', '$7,200'],
      ],
    },
  ],
};
