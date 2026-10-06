import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-294. A finished freeform template, as data only. Every asset lives
 * under `/templates/freeform/trip-planner/` (same-origin static files) and has
 * an entry in that folder's `credits.json`.
 */
export const TRIP_PLANNER: BoardTemplate = {
  id: 'trip-planner',
  name: 'Trip Planner',
  layout: 'freeform',
  previewUrl: '/templates/freeform/trip-planner/preview.jpg',
  posts: [
    { kind: 'column', key: 'plan', title: 'The trip', x: 60, y: 60, width: 360, height: 800, topStrip: '#ea580c' },
    { kind: 'image', title: 'Tram 28', src: '/templates/freeform/trip-planner/tram.jpg', parent: 'plan' },
    {
      kind: 'note',
      title: 'Five days in Lisbon',
      html: '<p><strong>Five days in Lisbon</strong></p><p><strong>When:</strong> five days in early May</p><p><strong>Stay:</strong> a guesthouse in Alfama</p><p><strong>Getting around:</strong> metro, tram 28 and a lot of walking</p>',
      parent: 'plan',
    },
    { kind: 'clipart', title: 'Flights', svg: '/templates/freeform/trip-planner/airplane.svg', iconBgColor: '#fed7aa', parent: 'plan' },
    {
      kind: 'todo',
      title: 'Before we go',
      tasks: [
        { text: 'Book flights', done: true },
        { text: 'Book the guesthouse', done: true },
        { text: 'Lisboa Card for three days', done: false },
        { text: 'Reserve a fado dinner', done: false },
        { text: 'Comfortable shoes!', done: false },
      ],
      parent: 'plan',
    },

    { kind: 'column', key: 'see', title: 'See & do', x: 460, y: 60, width: 360, height: 800, topStrip: '#0284c7' },
    { kind: 'image', title: 'Sunset at a miradouro', src: '/templates/freeform/trip-planner/viewpoint.jpg', parent: 'see' },
    {
      kind: 'note',
      title: 'Must-sees',
      html: '<p><strong>Must-sees</strong></p><ul><li>Belém Tower and the monastery</li><li>A day trip to Sintra</li><li>LX Factory on Sunday</li><li>Sunset at a miradouro</li></ul>',
      parent: 'see',
    },
    { kind: 'clipart', title: 'Photo spots', svg: '/templates/freeform/trip-planner/camera.svg', iconBgColor: '#bae6fd', parent: 'see' },
    { kind: 'clipart', title: 'Tram routes', svg: '/templates/freeform/trip-planner/tram-car.svg', iconBgColor: '#fef08a', parent: 'see' },

    { kind: 'column', key: 'eat', title: 'Eat & drink', x: 860, y: 60, width: 360, height: 800, topStrip: '#ca8a04' },
    { kind: 'image', title: 'Pastéis de nata, still warm', src: '/templates/freeform/trip-planner/pastel-de-nata.jpg', parent: 'eat' },
    {
      kind: 'note',
      title: 'Try',
      html: '<p><strong>Try</strong></p><ul><li>A bifana at the counter</li><li>Grilled sardines</li><li>Ginjinha in a chocolate cup</li></ul>',
      parent: 'eat',
    },

    {
      kind: 'table',
      title: 'Itinerary',
      x: 1260,
      y: 60,
      width: 520,
      height: 260,
      rows: [
        ['Day', 'Morning', 'Afternoon', 'Evening'],
        ['1', 'Arrive, walk Alfama', 'The castle', 'Fado dinner'],
        ['2', 'Belém', 'LX Factory', 'Bairro Alto'],
        ['3', 'Sintra', 'Sintra', 'Early night'],
        ['4', 'Tram 28', 'Chiado', 'Sunset at a miradouro'],
        ['5', 'Time Out Market', 'Fly home', '—'],
      ],
    },
    { kind: 'clipart', title: 'Packing list', svg: '/templates/freeform/trip-planner/luggage.svg', iconBgColor: '#e9d5ff', x: 1260, y: 360, width: 180, height: 220 },
  ],
};
