import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-294. A finished freeform template, as data only. Every asset lives
 * under `/templates/freeform/product-launch/` (same-origin static files) and
 * has an entry in that folder's `credits.json`.
 */
export const PRODUCT_LAUNCH: BoardTemplate = {
  id: 'product-launch',
  name: 'Product Launch',
  layout: 'freeform',
  previewUrl: '/templates/freeform/product-launch/preview.jpg',
  summary: 'Launch timeline, channels and tasks.',
  contents: ['Launch timeline', 'Channels', 'Owner to-dos'],
  posts: [
    { kind: 'column', key: 'product', title: 'The product', x: 60, y: 60, width: 360, height: 800, topStrip: '#0891b2' },
    { kind: 'image', title: 'Hydra, in four colours', src: '/templates/freeform/product-launch/bottles.jpg', parent: 'product' },
    {
      kind: 'note',
      title: 'What it is',
      html: '<p>An insulated steel bottle that keeps drinks cold for 24 hours and hot for 12.</p><ul><li>500 ml and 750 ml</li><li>Four colours</li><li>Lifetime warranty</li></ul>',
      parent: 'product',
    },
    { kind: 'clipart', title: 'Hydra', svg: '/templates/freeform/product-launch/droplet.svg', iconBgColor: '#a5f3fc', parent: 'product' },

    { kind: 'column', key: 'plan', title: 'Launch plan', x: 460, y: 60, width: 360, height: 800, topStrip: '#4f46e5' },
    { kind: 'image', title: 'Launch workshop', src: '/templates/freeform/product-launch/whiteboard.jpg', parent: 'plan' },
    {
      kind: 'todo',
      title: 'Launch checklist',
      tasks: [
        { text: 'Final samples approved', done: true },
        { text: 'Product photos', done: true },
        { text: 'Landing page live', done: false },
        { text: 'Press kit to 20 editors', done: false },
        { text: 'Launch email to the waiting list', done: false },
        { text: "Pop-up stand at the farmers' market", done: false },
      ],
      parent: 'plan',
    },
    { kind: 'clipart', title: 'Press', svg: '/templates/freeform/product-launch/megaphone.svg', iconBgColor: '#c7d2fe', parent: 'plan' },

    { kind: 'column', key: 'goals', title: 'Goals', x: 860, y: 60, width: 360, height: 800, topStrip: '#16a34a' },
    { kind: 'image', title: 'Hero shot', src: '/templates/freeform/product-launch/steel-bottle.jpg', parent: 'goals' },
    {
      kind: 'note',
      title: 'Targets',
      html: '<p><strong>Targets</strong></p><ul><li>1,500 bottles in the first month</li><li>5,000 people on the waiting list</li><li>Press in three lifestyle magazines</li></ul>',
      parent: 'goals',
    },
    { kind: 'clipart', title: 'Sales', svg: '/templates/freeform/product-launch/chart-increasing.svg', iconBgColor: '#bbf7d0', parent: 'goals' },
    { kind: 'clipart', title: 'Launch day', svg: '/templates/freeform/product-launch/rocket.svg', iconBgColor: '#bfdbfe', parent: 'goals' },

    {
      kind: 'table',
      title: 'Timeline',
      x: 1260,
      y: 60,
      width: 440,
      height: 260,
      rows: [
        ['Week', 'What', 'Owner'],
        ['−6', 'Samples and photos', 'Product'],
        ['−4', 'Landing page and waiting list', 'Marketing'],
        ['−2', 'Press kit out', 'PR'],
        ['0', 'Launch', 'Everyone'],
        ['+2', 'First results', 'Marketing'],
      ],
    },
  ],
};
