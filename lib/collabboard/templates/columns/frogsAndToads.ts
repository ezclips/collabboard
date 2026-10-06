import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-298. A second finished Columns template, as data only. Every asset
 * lives under `/templates/columns/frogs-and-toads/` with a matching entry in
 * that folder's `credits.json`. The template's sections define the columns.
 */
export const FROGS_AND_TOADS: BoardTemplate = {
  id: 'frogs-and-toads',
  name: 'Compare and Contrast',
  layout: 'columns',
  previewUrl: '/templates/columns/frogs-and-toads/preview.jpg',
  summary: 'Frogs, toads, and what they share.',
  contents: ['Frogs / Both / Toads columns', 'Photos and facts'],
  posts: [
    { kind: 'section', key: 'frogs', title: 'Frogs' },
    { kind: 'image', title: 'Smooth, wet skin', src: '/templates/columns/frogs-and-toads/frog.jpg', section: 'frogs' },
    {
      kind: 'note',
      title: 'Frogs',
      html: '<p><strong>Frogs</strong></p><ul><li>Smooth, moist skin</li><li>Long back legs for big jumps</li><li>Live in or close to water</li><li>Lay their eggs in clusters</li></ul>',
      section: 'frogs',
    },
    { kind: 'image', title: 'At home on the rocks', src: '/templates/columns/frogs-and-toads/frog-pond.jpg', section: 'frogs' },

    { kind: 'section', key: 'both', title: 'Both' },
    {
      kind: 'note',
      title: 'Both',
      html: '<p><strong>Both</strong></p><ul><li>Amphibians</li><li>Start life as tadpoles in water</li><li>Eat insects</li><li>Breathe through their skin as well as their lungs</li></ul>',
      section: 'both',
    },
    { kind: 'image', title: 'The pond where it all starts', src: '/templates/columns/frogs-and-toads/pond.jpg', section: 'both' },
    { kind: 'clipart', title: 'Water', svg: '/templates/columns/frogs-and-toads/droplet.svg', iconBgColor: '#bae6fd', section: 'both' },
    { kind: 'clipart', title: 'Amphibians', svg: '/templates/columns/frogs-and-toads/frog.svg', iconBgColor: '#bbf7d0', section: 'both' },

    { kind: 'section', key: 'toads', title: 'Toads' },
    { kind: 'image', title: 'Dry, bumpy skin', src: '/templates/columns/frogs-and-toads/toad.jpg', section: 'toads' },
    {
      kind: 'note',
      title: 'Toads',
      html: '<p><strong>Toads</strong></p><ul><li>Dry, bumpy skin</li><li>Short legs: they walk and make small hops</li><li>Can live far from water</li><li>Lay their eggs in long strings</li></ul>',
      section: 'toads',
    },
    { kind: 'image', title: 'A common toad up close', src: '/templates/columns/frogs-and-toads/toad-ground.jpg', section: 'toads' },

    { kind: 'section', key: 'question', title: 'Our question' },
    { kind: 'clipart', title: 'Look closer', svg: '/templates/columns/frogs-and-toads/magnifying-glass-tilted-left.svg', iconBgColor: '#fde68a', section: 'question' },
    {
      kind: 'note',
      title: 'Question',
      html: '<p><strong>Why can toads live far from water, but frogs cannot?</strong></p><p>Write your idea on a card and add it here.</p>',
      section: 'question',
    },
    { kind: 'clipart', title: 'Wonder', svg: '/templates/columns/frogs-and-toads/red-question-mark.svg', iconBgColor: '#fecaca', section: 'question' },
    { kind: 'clipart', title: 'Nature', svg: '/templates/columns/frogs-and-toads/leaf-fluttering-in-wind.svg', iconBgColor: '#d9f99d', section: 'question' },
  ],
};
