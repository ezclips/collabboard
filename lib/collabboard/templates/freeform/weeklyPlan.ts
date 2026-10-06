import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-294. A finished freeform template, as data only. Every asset lives
 * under `/templates/freeform/weekly-plan/` (same-origin static files) and has
 * an entry in that folder's `credits.json`.
 */
export const WEEKLY_PLAN: BoardTemplate = {
  id: 'weekly-plan',
  name: 'Weekly Plan',
  layout: 'freeform',
  previewUrl: '/templates/freeform/weekly-plan/preview.jpg',
  summary: 'Seven days with to-dos and notes.',
  contents: ['A card for every day', 'To-do lists', 'Weekly goals'],
  posts: [
    { kind: 'column', key: 'week', title: 'This week', x: 60, y: 60, width: 360, height: 800, topStrip: '#4f46e5' },
    { kind: 'image', title: 'Plan on Sunday evening', src: '/templates/freeform/weekly-plan/planner.jpg', parent: 'week' },
    {
      kind: 'note',
      title: 'Focus',
      html: '<p><strong>Three things that matter:</strong></p><ol><li>Finish the quarterly report</li><li>Run three times</li><li>Call Grandma</li></ol>',
      parent: 'week',
    },
    { kind: 'clipart', title: 'Week 12', svg: '/templates/freeform/weekly-plan/spiral-calendar.svg', iconBgColor: '#c7d2fe', parent: 'week' },

    { kind: 'column', key: 'work', title: 'Work', x: 460, y: 60, width: 360, height: 800, topStrip: '#0284c7' },
    {
      kind: 'todo',
      title: 'Work',
      tasks: [
        { text: 'Quarterly report draft', done: true },
        { text: 'Team one-to-ones (Mon, Wed)', done: false },
        { text: 'Review the new website copy', done: false },
        { text: 'Book flights for the offsite', done: false },
        { text: 'Clear the inbox on Friday', done: false },
      ],
      parent: 'work',
    },
    {
      kind: 'note',
      title: 'Notes',
      html: '<p>Deep work in the mornings — meetings after 2 pm.</p>',
      parent: 'work',
    },
    { kind: 'clipart', title: 'Reading', svg: '/templates/freeform/weekly-plan/books.svg', iconBgColor: '#bae6fd', parent: 'work' },

    { kind: 'column', key: 'health', title: 'Health & home', x: 860, y: 60, width: 360, height: 800, topStrip: '#16a34a' },
    { kind: 'image', title: 'Breakfast prep', src: '/templates/freeform/weekly-plan/breakfast.jpg', parent: 'health' },
    { kind: 'image', title: 'Runs: Mon · Wed · Sat', src: '/templates/freeform/weekly-plan/morning-run.jpg', parent: 'health' },
    { kind: 'clipart', title: '5 km', svg: '/templates/freeform/weekly-plan/running-shoe.svg', iconBgColor: '#bbf7d0', parent: 'health' },
    { kind: 'clipart', title: 'Meal plan', svg: '/templates/freeform/weekly-plan/green-salad.svg', iconBgColor: '#d9f99d', parent: 'health' },

    {
      kind: 'table',
      title: 'Meal plan',
      x: 1260,
      y: 60,
      width: 440,
      height: 260,
      rows: [
        ['Day', 'Lunch', 'Dinner'],
        ['Mon', 'Lentil salad', 'Vegetable curry'],
        ['Tue', 'Leftover curry', 'Pasta with greens'],
        ['Wed', 'Wraps', 'Salmon and rice'],
        ['Thu', 'Soup', 'Tacos'],
        ['Fri', 'Out with the team', 'Pizza night'],
      ],
    },
    {
      kind: 'todo',
      title: 'Home',
      x: 1260,
      y: 360,
      width: 300,
      height: 240,
      tasks: [
        { text: 'Laundry', done: true },
        { text: 'Water the plants', done: false },
        { text: 'Pay the electricity bill', done: false },
        { text: 'Groceries on Saturday morning', done: false },
      ],
    },
  ],
};
