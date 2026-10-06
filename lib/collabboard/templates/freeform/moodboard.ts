import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-294. A finished freeform template, as data only. Every asset lives
 * under `/templates/freeform/moodboard/` (same-origin static files) and has an
 * entry in that folder's `credits.json`.
 */
export const MOODBOARD: BoardTemplate = {
  id: 'moodboard',
  name: 'Moodboard',
  layout: 'freeform',
  previewUrl: '/templates/freeform/moodboard/preview.jpg',
  summary: 'Photos, colours and notes for a look.',
  contents: ['Photo collage', 'Colour swatches', 'Style notes'],
  posts: [
    { kind: 'column', key: 'mood', title: 'Mood', x: 60, y: 60, width: 360, height: 800, topStrip: '#d97706' },
    { kind: 'image', title: 'Evening light', src: '/templates/freeform/moodboard/living-room.jpg', parent: 'mood' },
    {
      kind: 'note',
      title: 'Feeling',
      html: '<p>Calm, warm and lived-in. Soft light in the evening, nothing shiny.</p>',
      parent: 'mood',
    },
    { kind: 'clipart', title: 'Candlelight', svg: '/templates/freeform/moodboard/candle.svg', iconBgColor: '#fde68a', parent: 'mood' },
    { kind: 'image', title: 'Soft layers', src: '/templates/freeform/moodboard/sofa-sheepskin.jpg', parent: 'mood' },

    { kind: 'column', key: 'textures', title: 'Textures', x: 460, y: 60, width: 360, height: 800, topStrip: '#a16207' },
    { kind: 'image', title: 'Washed linen', src: '/templates/freeform/moodboard/linen.jpg', parent: 'textures' },
    { kind: 'image', title: 'Jute rug', src: '/templates/freeform/moodboard/jute.jpg', parent: 'textures' },
    {
      kind: 'note',
      title: 'Materials',
      html: '<ul><li>Linen curtains, unlined</li><li>Jute or wool rug</li><li>Oak, oiled — not lacquered</li></ul>',
      parent: 'textures',
    },
    { kind: 'clipart', title: 'Little details', svg: '/templates/freeform/moodboard/sparkles.svg', iconBgColor: '#fef3c7', parent: 'textures' },

    { kind: 'column', key: 'objects', title: 'Objects & plants', x: 860, y: 60, width: 360, height: 800, topStrip: '#be185d' },
    { kind: 'image', title: 'Blush vase', src: '/templates/freeform/moodboard/pink-vase.jpg', parent: 'objects' },
    { kind: 'image', title: 'Clay collection', src: '/templates/freeform/moodboard/terracotta-vases.jpg', parent: 'objects' },
    { kind: 'clipart', title: 'More green', svg: '/templates/freeform/moodboard/potted-plant.svg', iconBgColor: '#bbf7d0', parent: 'objects' },
    { kind: 'image', title: 'Pampas by the window', src: '/templates/freeform/moodboard/pampas.jpg', parent: 'objects' },

    {
      kind: 'table',
      title: 'Palette',
      x: 1260,
      y: 60,
      width: 440,
      height: 220,
      rows: [
        ['Colour', 'Hex', 'Where'],
        ['Sand', '#D8C3A5', 'Walls'],
        ['Terracotta', '#C46A4A', 'Vases, cushions'],
        ['Olive', '#7A7F4F', 'Plants, throws'],
        ['Cream', '#F4EDE1', 'Linen'],
      ],
    },
    {
      kind: 'todo',
      title: 'Shopping list',
      x: 1260,
      y: 320,
      width: 300,
      height: 260,
      tasks: [
        { text: 'Two terracotta vases', done: true },
        { text: 'Jute rug 200 × 300 cm', done: false },
        { text: 'Linen curtains (two panels)', done: false },
        { text: 'Floor lamp with a fabric shade', done: false },
        { text: 'Pampas grass', done: true },
      ],
    },
    { kind: 'clipart', title: 'Art wall', svg: '/templates/freeform/moodboard/framed-picture.svg', iconBgColor: '#e7e5e4', x: 1600, y: 320, width: 180, height: 220 },
  ],
};
