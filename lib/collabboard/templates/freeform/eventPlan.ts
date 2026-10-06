import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-294. A finished freeform template, as data only. Every asset lives
 * under `/templates/freeform/event-plan/` (same-origin static files) and has an
 * entry in that folder's `credits.json`.
 */
export const EVENT_PLAN: BoardTemplate = {
  id: 'event-plan',
  name: 'Event Plan',
  layout: 'freeform',
  previewUrl: '/templates/freeform/event-plan/preview.jpg',
  posts: [
    { kind: 'column', key: 'party', title: 'The party', x: 60, y: 60, width: 360, height: 800, topStrip: '#db2777' },
    { kind: 'image', title: 'Lights on at eight', src: '/templates/freeform/event-plan/string-lights.jpg', parent: 'party' },
    {
      kind: 'note',
      title: 'Summer garden party',
      html: '<p><strong>Summer garden party</strong></p><p><strong>When:</strong> a Saturday in late June, from 5 pm</p><p><strong>Where:</strong> the back garden</p><p><strong>Guests:</strong> about 30</p><p><strong>Dress code:</strong> summer whites</p>',
      parent: 'party',
    },
    { kind: 'clipart', title: "Let's celebrate", svg: '/templates/freeform/event-plan/party-popper.svg', iconBgColor: '#fbcfe8', parent: 'party' },

    { kind: 'column', key: 'food', title: 'Food & drinks', x: 460, y: 60, width: 360, height: 800, topStrip: '#ea580c' },
    { kind: 'image', title: 'Sharing platters', src: '/templates/freeform/event-plan/food-spread.jpg', parent: 'food' },
    { kind: 'image', title: 'One long table', src: '/templates/freeform/event-plan/dinner-table.jpg', parent: 'food' },
    {
      kind: 'note',
      title: 'Menu',
      html: '<p><strong>Menu</strong></p><ul><li>Grilled vegetables and halloumi</li><li>Three salads</li><li>Lemonade and a spritz bar</li><li>Strawberry cake</li></ul>',
      parent: 'food',
    },
    { kind: 'clipart', title: 'Cake', svg: '/templates/freeform/event-plan/birthday-cake.svg', iconBgColor: '#fde68a', parent: 'food' },

    { kind: 'column', key: 'todo', title: 'To do', x: 860, y: 60, width: 360, height: 800, topStrip: '#16a34a' },
    {
      kind: 'todo',
      title: 'Checklist',
      tasks: [
        { text: 'Send the invitations', done: true },
        { text: 'Order the cake', done: true },
        { text: 'Borrow two long tables', done: false },
        { text: 'Hang the string lights', done: false },
        { text: 'Make a playlist', done: false },
        { text: 'Ice — lots of it', done: false },
      ],
      parent: 'todo',
    },
    { kind: 'clipart', title: 'Playlist', svg: '/templates/freeform/event-plan/musical-notes.svg', iconBgColor: '#ddd6fe', parent: 'todo' },
    { kind: 'clipart', title: 'Decorations', svg: '/templates/freeform/event-plan/balloon.svg', iconBgColor: '#fecaca', parent: 'todo' },

    {
      kind: 'table',
      title: 'Budget',
      x: 1260,
      y: 60,
      width: 440,
      height: 260,
      rows: [
        ['Item', 'Cost', 'Paid'],
        ['Food', '$320', '✓'],
        ['Drinks', '$180', '✓'],
        ['Cake', '$65', '✓'],
        ['Lights and decorations', '$90', ''],
        ['Table hire', '$40', ''],
        ['Total', '$695', ''],
      ],
    },
  ],
};
