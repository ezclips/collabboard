import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-298. A second finished Wall template, as data only. Every asset lives
 * under `/templates/wall/art-gallery/` (same-origin static files) with a
 * matching entry in that folder's `credits.json`.
 */
export const STUDENT_ART_GALLERY: BoardTemplate = {
  id: 'art-gallery',
  name: 'Student Art Gallery',
  layout: 'wall',
  previewUrl: '/templates/wall/art-gallery/preview.jpg',
  posts: [
    { kind: 'column', key: 'welcome', title: 'Our art gallery 🎨' },
    {
      kind: 'note',
      title: 'Welcome',
      html: '<p>Welcome to our class gallery! Each card shows one piece of art. Leave a kind comment and tell the artist what you notice.</p>',
      parent: 'welcome',
    },
    { kind: 'clipart', title: 'Gallery', svg: '/templates/wall/art-gallery/framed-picture.svg', iconBgColor: '#e7e5e4', parent: 'welcome' },

    { kind: 'column', key: 'scooter', title: 'Scooter Day — Mia, watercolour' },
    { kind: 'image', title: 'Scooter Day', src: '/templates/wall/art-gallery/watercolor.jpg', parent: 'scooter' },
    {
      kind: 'note',
      title: "Artist's note",
      html: '<p>I painted my brother and me racing to the park. The balloons are from his party.</p>',
      parent: 'scooter',
    },
    { kind: 'clipart', title: 'Love it', svg: '/templates/wall/art-gallery/red-heart.svg', iconBgColor: '#fecaca', parent: 'scooter' },

    { kind: 'column', key: 'mother-child', title: 'Mother and Child — Jonas, clay' },
    { kind: 'image', title: 'Mother and Child', src: '/templates/wall/art-gallery/clay-figures.jpg', parent: 'mother-child' },
    {
      kind: 'note',
      title: "Artist's note",
      html: '<p>I shaped this from one block of clay and let it dry for a week before painting it.</p>',
      parent: 'mother-child',
    },

    { kind: 'column', key: 'cut-paste', title: 'Cut and Paste — Aisha, collage' },
    { kind: 'image', title: 'Cut and Paste', src: '/templates/wall/art-gallery/collage.jpg', parent: 'cut-paste' },
    {
      kind: 'note',
      title: "Artist's note",
      html: '<p>Every shape comes from old magazines. I looked for bright colours and patterns.</p>',
      parent: 'cut-paste',
    },
    { kind: 'clipart', title: 'Bravo!', svg: '/templates/wall/art-gallery/clapping-hands.svg', iconBgColor: '#fef08a', parent: 'cut-paste' },

    { kind: 'column', key: 'sketchbook', title: 'Sketchbook — Leo, pencil' },
    { kind: 'image', title: 'Sketchbook', src: '/templates/wall/art-gallery/bird-sketches.jpg', parent: 'sketchbook' },
    {
      kind: 'note',
      title: "Artist's note",
      html: '<p>Quick sketches of birds and flowers. I tried to draw each one in under two minutes.</p>',
      parent: 'sketchbook',
    },

    { kind: 'column', key: 'behind-scenes', title: 'Behind the scenes' },
    { kind: 'image', title: 'Painting time', src: '/templates/wall/art-gallery/paint-box.jpg', parent: 'behind-scenes' },
    {
      kind: 'todo',
      title: 'Gallery checklist',
      tasks: [
        { text: 'Photograph every artwork', done: true },
        { text: "Write an artist's note", done: true },
        { text: 'Leave two kind comments', done: false },
        { text: 'Choose one piece for the school hall', done: false },
      ],
      parent: 'behind-scenes',
    },
    { kind: 'clipart', title: 'Colours', svg: '/templates/wall/art-gallery/artist-palette.svg', iconBgColor: '#fbcfe8', parent: 'behind-scenes' },
  ],
};
