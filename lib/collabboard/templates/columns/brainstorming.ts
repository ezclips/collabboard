import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-296. A finished Columns template, as data only. Every asset lives
 * under `/templates/columns/brainstorming/` with a matching entry in that
 * folder's `credits.json`. The template's sections define the column titles.
 */
export const BRAINSTORMING: BoardTemplate = {
  id: 'brainstorming',
  name: 'Brainstorming Board',
  layout: 'columns',
  previewUrl: '/templates/columns/brainstorming/preview.jpg',
  summary: 'Ideas sorted into columns.',
  contents: ['Three idea columns', 'Starter sticky notes'],
  posts: [
    { kind: 'section', key: 'question', title: 'The question' },
    {
      kind: 'note',
      title: 'Our question',
      html: '<p><strong>How can we make our school greener this year?</strong></p><p>Add one idea per card and vote with a ❤️.</p>',
      section: 'question',
    },
    { kind: 'image', title: 'Brainstorm day', src: '/templates/columns/brainstorming/sticky-notes.jpg', section: 'question' },
    { kind: 'clipart', title: 'Ideas welcome', svg: '/templates/columns/brainstorming/light-bulb.svg', iconBgColor: '#fef08a', section: 'question' },

    { kind: 'section', key: 'ideas', title: 'Ideas' },
    {
      kind: 'note',
      title: 'Plant a school garden',
      html: '<p><strong>Plant a school garden</strong></p><p>Vegetables and flowers in the courtyard; each class looks after one bed.</p>',
      section: 'ideas',
    },
    {
      kind: 'note',
      title: 'Bike to school week',
      html: '<p><strong>Bike to school week</strong></p><p>One week where everyone walks, rolls or bikes. A prize for the class with the most.</p>',
      section: 'ideas',
    },
    {
      kind: 'note',
      title: 'Swap shop',
      html: '<p><strong>Swap shop</strong></p><p>Bring books and toys you no longer use and swap them.</p>',
      section: 'ideas',
    },
    { kind: 'image', title: 'More ideas on the wall', src: '/templates/columns/brainstorming/idea-wall.jpg', section: 'ideas' },

    { kind: 'section', key: 'questions', title: 'Questions' },
    { kind: 'clipart', title: 'Big questions', svg: '/templates/columns/brainstorming/red-question-mark.svg', iconBgColor: '#fecaca', section: 'questions' },
    {
      kind: 'note',
      title: 'Who waters the garden in summer?',
      html: '<p><strong>Who waters the garden in summer?</strong></p><p>Could families take turns during the holidays?</p>',
      section: 'questions',
    },
    {
      kind: 'note',
      title: 'Where do we start?',
      html: '<p><strong>Where do we start?</strong></p><p>Which idea is the cheapest to try first?</p>',
      section: 'questions',
    },
    { kind: 'clipart', title: 'Think about it', svg: '/templates/columns/brainstorming/thinking-face.svg', iconBgColor: '#fde68a', section: 'questions' },

    { kind: 'section', key: 'resources', title: 'Resources' },
    { kind: 'image', title: 'Books about gardening', src: '/templates/columns/brainstorming/library.jpg', section: 'resources' },
    {
      kind: 'note',
      title: 'Useful contacts',
      html: "<p><strong>Useful contacts</strong></p><ul><li>Ask the city about free tree seedlings</li><li>Talk to the parents' association</li><li>Find a local gardening club</li></ul>",
      section: 'resources',
    },
    { kind: 'clipart', title: 'Reading', svg: '/templates/columns/brainstorming/books.svg', iconBgColor: '#bae6fd', section: 'resources' },

    { kind: 'section', key: 'next', title: 'Next steps' },
    {
      kind: 'todo',
      title: 'Plan',
      tasks: [
        { text: 'Vote on the top three ideas', done: true },
        { text: 'Ask the principal', done: false },
        { text: 'Make a poster', done: false },
        { text: 'Start with the swap shop', done: false },
      ],
      section: 'next',
    },
    { kind: 'clipart', title: 'Done!', svg: '/templates/columns/brainstorming/check-mark-button.svg', iconBgColor: '#bbf7d0', section: 'next' },
  ],
};
