import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-296. A finished Grid template, as data only. Every asset lives under
 * `/templates/grid/science-vocabulary/` with a matching entry in that
 * folder's `credits.json`. Each section is a row, each container a word card.
 */
export const SCIENCE_VOCABULARY: BoardTemplate = {
  id: 'science-vocabulary',
  name: 'Science Vocabulary',
  layout: 'grid',
  previewUrl: '/templates/grid/science-vocabulary/preview.jpg',
  posts: [
    { kind: 'section', key: 'living', title: 'Living things' },

    { kind: 'column', key: 'habitat', title: 'Habitat', section: 'living' },
    { kind: 'image', title: 'Habitat', src: '/templates/grid/science-vocabulary/habitat.jpg', parent: 'habitat' },
    {
      kind: 'note',
      title: 'Habitat',
      html: '<p><strong>Habitat:</strong> the natural home of a plant or animal, where it finds food, water and shelter.</p><p><em>A forest is a habitat for owls and deer.</em></p>',
      parent: 'habitat',
    },
    { kind: 'clipart', title: 'Plants', svg: '/templates/grid/science-vocabulary/herb.svg', iconBgColor: '#bbf7d0', parent: 'habitat' },

    { kind: 'column', key: 'photosynthesis', title: 'Photosynthesis', section: 'living' },
    { kind: 'image', title: 'Photosynthesis', src: '/templates/grid/science-vocabulary/photosynthesis.jpg', parent: 'photosynthesis' },
    {
      kind: 'note',
      title: 'Photosynthesis',
      html: '<p><strong>Photosynthesis:</strong> how plants use sunlight, water and air to make their own food.</p><p><em>Leaves turn light into energy.</em></p>',
      parent: 'photosynthesis',
    },
    { kind: 'clipart', title: 'Sunlight', svg: '/templates/grid/science-vocabulary/sun.svg', iconBgColor: '#fef08a', parent: 'photosynthesis' },

    { kind: 'column', key: 'pollination', title: 'Pollination', section: 'living' },
    { kind: 'image', title: 'Pollination', src: '/templates/grid/science-vocabulary/pollination.jpg', parent: 'pollination' },
    {
      kind: 'note',
      title: 'Pollination',
      html: '<p><strong>Pollination:</strong> moving pollen from flower to flower so plants can make seeds.</p><p><em>Bees carry pollen on their legs.</em></p>',
      parent: 'pollination',
    },

    { kind: 'column', key: 'migration', title: 'Migration', section: 'living' },
    { kind: 'image', title: 'Migration', src: '/templates/grid/science-vocabulary/migration.jpg', parent: 'migration' },
    {
      kind: 'note',
      title: 'Migration',
      html: '<p><strong>Migration:</strong> when animals travel a long way at the same time each year.</p><p><em>Geese fly south for the winter.</em></p>',
      parent: 'migration',
    },

    { kind: 'section', key: 'earth', title: 'Earth and water' },

    { kind: 'column', key: 'erosion', title: 'Erosion', section: 'earth' },
    { kind: 'image', title: 'Erosion', src: '/templates/grid/science-vocabulary/erosion.jpg', parent: 'erosion' },
    {
      kind: 'note',
      title: 'Erosion',
      html: '<p><strong>Erosion:</strong> when wind, water or ice slowly wear away rock and soil.</p><p><em>A river carved this canyon.</em></p>',
      parent: 'erosion',
    },

    { kind: 'column', key: 'evaporation', title: 'Evaporation', section: 'earth' },
    { kind: 'image', title: 'Evaporation', src: '/templates/grid/science-vocabulary/evaporation.jpg', parent: 'evaporation' },
    {
      kind: 'note',
      title: 'Evaporation',
      html: '<p><strong>Evaporation:</strong> when liquid water turns into a gas called water vapour.</p><p><em>Morning mist rises from the lake.</em></p>',
      parent: 'evaporation',
    },

    { kind: 'column', key: 'water-cycle', title: 'Water cycle', section: 'earth' },
    { kind: 'clipart', title: 'Water', svg: '/templates/grid/science-vocabulary/droplet.svg', iconBgColor: '#bae6fd', parent: 'water-cycle' },
    {
      kind: 'note',
      title: 'Water cycle',
      html: '<p><strong>Water cycle: </strong> water evaporates, forms clouds, falls as rain and flows back to the sea — again and again.</p>',
      parent: 'water-cycle',
    },

    { kind: 'column', key: 'ecosystem', title: 'Ecosystem', section: 'earth' },
    { kind: 'clipart', title: 'Our planet', svg: '/templates/grid/science-vocabulary/globe-showing-europe-africa.svg', iconBgColor: '#bbf7d0', parent: 'ecosystem' },
    {
      kind: 'note',
      title: 'Ecosystem',
      html: '<p><strong>Ecosystem:</strong> all the living things in a place, and how they depend on each other and on the land, water and air.</p>',
      parent: 'ecosystem',
    },
  ],
};
