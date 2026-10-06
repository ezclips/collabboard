import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-298. A second finished Timeline template, as data only. Every asset
 * lives under `/templates/timeline/marie-curie/` with a matching entry in that
 * folder's `credits.json`.
 */
export const MARIE_CURIE: BoardTemplate = {
  id: 'marie-curie',
  name: 'Marie Curie: A Life in Science',
  layout: 'timeline',
  previewUrl: '/templates/timeline/marie-curie/preview.jpg',
  posts: [
    { kind: 'column', key: 'born', title: 'Born in Warsaw', timelineLabel: '1867' },
    { kind: 'image', title: "Warsaw's Old Town", src: '/templates/timeline/marie-curie/warsaw.jpg', parent: 'born' },
    {
      kind: 'note',
      title: 'Childhood',
      html: '<p>Maria Skłodowska is born in Warsaw, Poland, the youngest of five children of two teachers.</p>',
      parent: 'born',
    },

    { kind: 'column', key: 'paris', title: 'Off to Paris', timelineLabel: '1891' },
    { kind: 'image', title: 'Paris', src: '/templates/timeline/marie-curie/paris.jpg', parent: 'paris' },
    {
      kind: 'note',
      title: 'Studies',
      html: '<p>She moves to Paris to study physics and mathematics at the Sorbonne, often studying late into the night.</p>',
      parent: 'paris',
    },
    { kind: 'clipart', title: 'Books', svg: '/templates/timeline/marie-curie/books.svg', iconBgColor: '#bae6fd', parent: 'paris' },

    { kind: 'column', key: 'marriage', title: 'Marie and Pierre', timelineLabel: '1895' },
    {
      kind: 'note',
      title: 'Marriage',
      html: '<p>She marries the physicist Pierre Curie. They work side by side in their laboratory.</p>',
      parent: 'marriage',
    },
    { kind: 'clipart', title: 'Lab work', svg: '/templates/timeline/marie-curie/test-tube.svg', iconBgColor: '#bbf7d0', parent: 'marriage' },

    { kind: 'column', key: 'elements', title: 'Two new elements', timelineLabel: '1898' },
    { kind: 'image', title: 'Laboratory glassware', src: '/templates/timeline/marie-curie/glassware.jpg', parent: 'elements' },
    {
      kind: 'note',
      title: 'Polonium and radium',
      html: '<p>Marie and Pierre discover two new elements: polonium, named after Poland, and radium. Marie calls the effect “radioactivity”.</p>',
      parent: 'elements',
    },
    { kind: 'clipart', title: 'Radioactivity', svg: '/templates/timeline/marie-curie/radioactive.svg', iconBgColor: '#fef08a', parent: 'elements' },

    { kind: 'column', key: 'first-nobel', title: 'The first Nobel Prize', timelineLabel: '1903' },
    { kind: 'image', title: 'A medal for science', src: '/templates/timeline/marie-curie/medal.jpg', parent: 'first-nobel' },
    {
      kind: 'note',
      title: 'Physics',
      html: '<p>She shares the Nobel Prize in Physics with Pierre Curie and Henri Becquerel — the first woman to win a Nobel Prize.</p>',
      parent: 'first-nobel',
    },
    { kind: 'clipart', title: 'Prize', svg: '/templates/timeline/marie-curie/1st-place-medal.svg', iconBgColor: '#fde68a', parent: 'first-nobel' },

    { kind: 'column', key: 'second-nobel', title: 'A second Nobel Prize', timelineLabel: '1911' },
    { kind: 'image', title: 'An antique microscope', src: '/templates/timeline/marie-curie/microscope.jpg', parent: 'second-nobel' },
    {
      kind: 'note',
      title: 'Chemistry',
      html: '<p>She wins the Nobel Prize in Chemistry and becomes the first person to win Nobel Prizes in two sciences.</p>',
      parent: 'second-nobel',
    },
    { kind: 'clipart', title: 'Science', svg: '/templates/timeline/marie-curie/microscope.svg', iconBgColor: '#e9d5ff', parent: 'second-nobel' },

    { kind: 'column', key: 'x-rays', title: 'X-rays at the front', timelineLabel: '1914' },
    {
      kind: 'note',
      title: 'World War I',
      html: '<p>She sets up mobile X-ray units — nicknamed “little Curies” — to help doctors treat wounded soldiers.</p>',
      parent: 'x-rays',
    },
    { kind: 'clipart', title: 'Mobile X-ray', svg: '/templates/timeline/marie-curie/ambulance.svg', iconBgColor: '#fecaca', parent: 'x-rays' },

    { kind: 'column', key: 'legacy', title: 'Her legacy', timelineLabel: '1934' },
    {
      kind: 'note',
      title: 'Legacy',
      html: '<p>Marie Curie dies in France. Her work opened the way to modern physics and to cancer treatment with radiation.</p>',
      parent: 'legacy',
    },
  ],
};
