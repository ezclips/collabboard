import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-296. A finished Wall template, as data only. Every asset lives under
 * `/templates/wall/birthday-wall/` (same-origin static files) with a
 * matching entry in that folder's `credits.json`.
 */
export const BIRTHDAY_WALL: BoardTemplate = {
  id: 'birthday-wall',
  name: 'Birthday Wall',
  layout: 'wall',
  posts: [
    { kind: 'column', key: 'maya', title: 'Happy birthday, Maya! 🎉' },
    { kind: 'image', title: 'Happy birthday!', src: '/templates/wall/birthday-wall/birthday-letters.jpg', parent: 'maya' },
    {
      kind: 'note',
      title: 'Today',
      html: '<p>Maya turns 10 today! Leave her a message, a drawing or a photo.</p>',
      parent: 'maya',
    },
    { kind: 'clipart', title: 'Party time', svg: '/templates/wall/birthday-wall/party-popper.svg', iconBgColor: '#fbcfe8', parent: 'maya' },

    { kind: 'column', key: 'leo', title: 'From Leo' },
    {
      kind: 'note',
      title: 'Leo',
      html: '<p>Happy birthday, Maya! Thanks for always sharing your crayons. Have the best day! 🎈</p>',
      parent: 'leo',
    },
    { kind: 'clipart', title: 'Balloons', svg: '/templates/wall/birthday-wall/balloon.svg', iconBgColor: '#fecaca', parent: 'leo' },

    { kind: 'column', key: 'ortiz', title: 'From Ms. Ortiz' },
    {
      kind: 'note',
      title: 'Ms. Ortiz',
      html: '<p>Maya, your curiosity makes our class brighter every day. Have a wonderful birthday!</p>',
      parent: 'ortiz',
    },
    { kind: 'image', title: 'Make a wish', src: '/templates/wall/birthday-wall/candles.jpg', parent: 'ortiz' },

    { kind: 'column', key: 'sam-ava', title: 'From Sam and Ava' },
    { kind: 'image', title: 'For you!', src: '/templates/wall/birthday-wall/balloons.jpg', parent: 'sam-ava' },
    {
      kind: 'note',
      title: 'Sam and Ava',
      html: '<p>We hope your year is full of adventures, books and pizza!</p>',
      parent: 'sam-ava',
    },
    { kind: 'clipart', title: 'Cake!', svg: '/templates/wall/birthday-wall/birthday-cake.svg', iconBgColor: '#fde68a', parent: 'sam-ava' },

    { kind: 'column', key: 'gift', title: 'Class gift' },
    {
      kind: 'todo',
      title: 'Gift plan',
      tasks: [
        { text: 'A card signed by everyone', done: true },
        { text: 'A mystery book', done: true },
        { text: 'Wrap it in her favourite colours', done: false },
        { text: 'Hide it until lunch', done: false },
      ],
      parent: 'gift',
    },
    { kind: 'clipart', title: 'Gift', svg: '/templates/wall/birthday-wall/wrapped-gift.svg', iconBgColor: '#e9d5ff', parent: 'gift' },

    { kind: 'column', key: 'photos', title: 'Party photos' },
    { kind: 'image', title: 'Confetti!', src: '/templates/wall/birthday-wall/confetti.jpg', parent: 'photos' },
    { kind: 'clipart', title: 'Best day', svg: '/templates/wall/birthday-wall/star-struck.svg', iconBgColor: '#fef08a', parent: 'photos' },
  ],
};
