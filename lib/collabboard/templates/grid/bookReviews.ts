import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-298. A second finished Grid template, as data only. Every asset lives
 * under `/templates/grid/book-reviews/` with a matching entry in that folder's
 * `credits.json`. Each section is a row, each container a book card.
 */
export const BOOK_REVIEWS: BoardTemplate = {
  id: 'book-reviews',
  name: 'Book Reviews',
  layout: 'grid',
  previewUrl: '/templates/grid/book-reviews/preview.jpg',
  summary: 'Book covers with short reviews.',
  contents: ['Book cards', 'Star ratings and reviews'],
  posts: [
    { kind: 'section', key: 'adventure', title: 'Adventure' },

    { kind: 'column', key: 'treasure-island', title: 'Treasure Island — Robert Louis Stevenson', section: 'adventure' },
    { kind: 'image', title: 'Adventure on every page', src: '/templates/grid/book-reviews/open-book.jpg', parent: 'treasure-island' },
    {
      kind: 'note',
      title: 'Review',
      html: '<p><strong>★★★★★</strong></p><p>Jim Hawkins finds a treasure map and sails off with a crew of pirates. Long John Silver is the best villain ever.</p><p><em>— Sam, 11</em></p>',
      parent: 'treasure-island',
    },
    { kind: 'clipart', title: 'Pirates!', svg: '/templates/grid/book-reviews/skull-and-crossbones.svg', iconBgColor: '#e7e5e4', parent: 'treasure-island' },

    { kind: 'column', key: 'alice', title: "Alice's Adventures in Wonderland — Lewis Carroll", section: 'adventure' },
    { kind: 'clipart', title: 'Down the rabbit hole', svg: '/templates/grid/book-reviews/rabbit-face.svg', iconBgColor: '#fbcfe8', parent: 'alice' },
    {
      kind: 'note',
      title: 'Review',
      html: '<p><strong>★★★★☆</strong></p><p>Alice follows a white rabbit into a world where nothing makes sense. Funny and very strange!</p><p><em>— Mia, 10</em></p>',
      parent: 'alice',
    },

    { kind: 'column', key: 'willows', title: 'The Wind in the Willows — Kenneth Grahame', section: 'adventure' },
    { kind: 'image', title: 'A cosy reading corner', src: '/templates/grid/book-reviews/books-plants.jpg', parent: 'willows' },
    {
      kind: 'note',
      title: 'Review',
      html: '<p><strong>★★★★☆</strong></p><p>Mole, Rat, Badger and the very silly Mr. Toad have adventures on the river.</p><p><em>— Leo, 9</em></p>',
      parent: 'willows',
    },
    { kind: 'clipart', title: 'River trip', svg: '/templates/grid/book-reviews/canoe.svg', iconBgColor: '#bae6fd', parent: 'willows' },

    { kind: 'section', key: 'classics', title: 'Classics we love' },

    { kind: 'column', key: 'secret-garden', title: 'The Secret Garden — Frances Hodgson Burnett', section: 'classics' },
    { kind: 'image', title: 'Reading time', src: '/templates/grid/book-reviews/book-heart.jpg', parent: 'secret-garden' },
    {
      kind: 'note',
      title: 'Review',
      html: '<p><strong>★★★★★</strong></p><p>Mary finds a locked garden and brings it back to life — and herself too.</p><p><em>— Aisha, 11</em></p>',
      parent: 'secret-garden',
    },
    { kind: 'clipart', title: 'Garden', svg: '/templates/grid/book-reviews/tulip.svg', iconBgColor: '#bbf7d0', parent: 'secret-garden' },

    { kind: 'column', key: 'black-beauty', title: 'Black Beauty — Anna Sewell', section: 'classics' },
    { kind: 'image', title: 'From our class library', src: '/templates/grid/book-reviews/book-stack.jpg', parent: 'black-beauty' },
    {
      kind: 'note',
      title: 'Review',
      html: '<p><strong>★★★★☆</strong></p><p>A horse tells his own life story. It made me think about how we treat animals.</p><p><em>— Jonas, 10</em></p>',
      parent: 'black-beauty',
    },
    { kind: 'clipart', title: 'Horses', svg: '/templates/grid/book-reviews/horse-face.svg', iconBgColor: '#fed7aa', parent: 'black-beauty' },

    { kind: 'column', key: 'how-to', title: 'How to write a review', section: 'classics' },
    { kind: 'image', title: 'Your next book', src: '/templates/grid/book-reviews/reading-glasses.jpg', parent: 'how-to' },
    {
      kind: 'note',
      title: 'Tips',
      html: '<ul><li>Say what the book is about in two sentences</li><li>Give it 1 to 5 stars</li><li>Say who would enjoy it</li><li>No spoilers!</li></ul>',
      parent: 'how-to',
    },
    { kind: 'clipart', title: 'Stars', svg: '/templates/grid/book-reviews/star.svg', iconBgColor: '#fef08a', parent: 'how-to' },
  ],
};
