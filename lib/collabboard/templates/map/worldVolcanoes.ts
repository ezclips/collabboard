import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-296. A finished Map template, as data only. Every asset lives under
 * `/templates/map/world-volcanoes/` with a matching entry in that folder's
 * `credits.json`. Each container is a pin at its own coordinates.
 */
export const WORLD_VOLCANOES: BoardTemplate = {
  id: 'world-volcanoes',
  name: 'World Volcanoes',
  layout: 'map',
  previewUrl: '/templates/map/world-volcanoes/preview.jpg',
  summary: 'Famous volcanoes pinned on the map.',
  contents: ['Pins with photos', 'Height and last eruption'],
  posts: [
    { kind: 'column', key: 'fuji', title: 'Mount Fuji, Japan', location: { lat: 35.3606, lng: 138.7274, label: 'Mount Fuji, Japan' } },
    { kind: 'image', title: 'Mount Fuji', src: '/templates/map/world-volcanoes/fuji.jpg', parent: 'fuji' },
    {
      kind: 'note',
      title: 'Facts',
      html: "<p><strong>Height:</strong> 3,776 m</p><p><strong>Type:</strong> stratovolcano</p><p><strong>Last eruption:</strong> 1707</p><p>Japan's highest mountain.</p>",
      parent: 'fuji',
    },
    { kind: 'clipart', title: 'Stratovolcano', svg: '/templates/map/world-volcanoes/volcano.svg', iconBgColor: '#fed7aa', parent: 'fuji' },

    { kind: 'column', key: 'vesuvius', title: 'Mount Vesuvius, Italy', location: { lat: 40.8214, lng: 14.4260, label: 'Mount Vesuvius, Italy' } },
    { kind: 'image', title: 'Vesuvius above the Bay of Naples', src: '/templates/map/world-volcanoes/vesuvius.jpg', parent: 'vesuvius' },
    {
      kind: 'note',
      title: 'Facts',
      html: '<p><strong>Height:</strong> 1,281 m</p><p><strong>Type:</strong> stratovolcano</p><p><strong>Famous eruption:</strong> AD 79, which buried Pompeii and Herculaneum</p><p><strong>Last eruption:</strong> 1944</p>',
      parent: 'vesuvius',
    },

    { kind: 'column', key: 'kilauea', title: 'Kīlauea, Hawaii, USA', location: { lat: 19.4069, lng: -155.2834, label: 'Kīlauea, Hawaii, USA' } },
    { kind: 'image', title: 'A lava fountain at Kīlauea', src: '/templates/map/world-volcanoes/kilauea.jpg', parent: 'kilauea' },
    {
      kind: 'note',
      title: 'Facts',
      html: '<p><strong>Height:</strong> 1,247 m</p><p><strong>Type:</strong> shield volcano</p><p>One of the most active volcanoes on Earth; its lava keeps adding new land to the island.</p>',
      parent: 'kilauea',
    },
    { kind: 'clipart', title: 'Hot lava', svg: '/templates/map/world-volcanoes/fire.svg', iconBgColor: '#fecaca', parent: 'kilauea' },

    { kind: 'column', key: 'etna', title: 'Mount Etna, Italy', location: { lat: 37.7510, lng: 14.9934, label: 'Mount Etna, Italy' } },
    { kind: 'image', title: 'Etna above a Sicilian town', src: '/templates/map/world-volcanoes/etna.jpg', parent: 'etna' },
    {
      kind: 'note',
      title: 'Facts',
      html: "<p><strong>Height:</strong> over 3,300 m — it changes with every eruption</p><p><strong>Type: </strong> stratovolcano</p><p>Europe's most active volcano.</p>",
      parent: 'etna',
    },

    { kind: 'column', key: 'reykjanes', title: 'Reykjanes Peninsula, Iceland', location: { lat: 63.8800, lng: -22.4000, label: 'Reykjanes Peninsula, Iceland' } },
    { kind: 'image', title: 'Lava near Grindavík', src: '/templates/map/world-volcanoes/reykjanes.jpg', parent: 'reykjanes' },
    {
      kind: 'note',
      title: 'Facts',
      html: '<p><strong>Type:</strong> fissure eruptions — lava pours out of long cracks in the ground</p><p>Since 2021 the peninsula has erupted again and again, after about 800 quiet years.</p>',
      parent: 'reykjanes',
    },
  ],
};
