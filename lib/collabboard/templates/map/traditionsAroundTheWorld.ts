import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-298. A second finished Map template, as data only. Every asset lives
 * under `/templates/map/traditions-around-the-world/` with a matching entry in
 * that folder's `credits.json`. Each container is a pin at its own coordinates.
 */
export const TRADITIONS_AROUND_THE_WORLD: BoardTemplate = {
  id: 'traditions-around-the-world',
  name: 'Traditions Around the World',
  layout: 'map',
  previewUrl: '/templates/map/traditions-around-the-world/preview.jpg',
  posts: [
    { kind: 'column', key: 'diwali', title: 'Diwali — India', location: { lat: 28.6139, lng: 77.209, label: 'New Delhi, India' } },
    { kind: 'image', title: 'Clay lamps called diyas', src: '/templates/map/traditions-around-the-world/diwali.jpg', parent: 'diwali' },
    {
      kind: 'note',
      title: 'Diwali',
      html: '<p><strong>Diwali</strong>, the festival of lights, is celebrated in autumn. Families light clay lamps, share sweets and wear new clothes.</p>',
      parent: 'diwali',
    },
    { kind: 'clipart', title: 'Diya', svg: '/templates/map/traditions-around-the-world/diya-lamp.svg', iconBgColor: '#fed7aa', parent: 'diwali' },

    { kind: 'column', key: 'dia-de-muertos', title: 'Día de Muertos — Mexico', location: { lat: 19.4326, lng: -99.1332, label: 'Mexico City, Mexico' } },
    { kind: 'image', title: 'A Día de Muertos altar', src: '/templates/map/traditions-around-the-world/day-of-the-dead.jpg', parent: 'dia-de-muertos' },
    {
      kind: 'note',
      title: 'Día de Muertos',
      html: '<p>On 1 and 2 November families build altars with marigolds, photos and favourite foods to remember loved ones who have died.</p>',
      parent: 'dia-de-muertos',
    },

    { kind: 'column', key: 'hanami', title: 'Hanami — Japan', location: { lat: 35.0116, lng: 135.7681, label: 'Kyoto, Japan' } },
    { kind: 'image', title: 'Cherry blossoms by the Kamo River, Kyoto', src: '/templates/map/traditions-around-the-world/hanami.jpg', parent: 'hanami' },
    {
      kind: 'note',
      title: 'Hanami',
      html: '<p>In spring, people picnic under blooming cherry trees — <em>hanami</em> means “flower viewing”.</p>',
      parent: 'hanami',
    },
    { kind: 'clipart', title: 'Sakura', svg: '/templates/map/traditions-around-the-world/cherry-blossom.svg', iconBgColor: '#fbcfe8', parent: 'hanami' },

    { kind: 'column', key: 'lunar-new-year', title: 'Lunar New Year — China', location: { lat: 39.9042, lng: 116.4074, label: 'Beijing, China' } },
    { kind: 'image', title: 'Red lanterns for good luck', src: '/templates/map/traditions-around-the-world/lanterns.jpg', parent: 'lunar-new-year' },
    {
      kind: 'note',
      title: 'Lunar New Year',
      html: '<p>Families gather for a big dinner, hang red lanterns and give children red envelopes with money.</p>',
      parent: 'lunar-new-year',
    },
    { kind: 'clipart', title: 'Lantern', svg: '/templates/map/traditions-around-the-world/red-paper-lantern.svg', iconBgColor: '#fecaca', parent: 'lunar-new-year' },

    { kind: 'column', key: 'midsummer', title: 'Midsummer — Sweden', location: { lat: 59.3293, lng: 18.0686, label: 'Stockholm, Sweden' } },
    { kind: 'image', title: 'Flower crowns', src: '/templates/map/traditions-around-the-world/midsummer.jpg', parent: 'midsummer' },
    {
      kind: 'note',
      title: 'Midsummer',
      html: '<p>Around the longest day of the year, people dance around a maypole, wear flower crowns and eat strawberries.</p>',
      parent: 'midsummer',
    },

    { kind: 'column', key: 'carnival', title: 'Carnival — Brazil', location: { lat: -22.9068, lng: -43.1729, label: 'Rio de Janeiro, Brazil' } },
    { kind: 'image', title: 'Carnival costumes', src: '/templates/map/traditions-around-the-world/carnival.jpg', parent: 'carnival' },
    {
      kind: 'note',
      title: 'Carnival',
      html: '<p>Before Lent, cities fill with parades, samba music and dazzling costumes for several days.</p>',
      parent: 'carnival',
    },
    { kind: 'clipart', title: 'Party', svg: '/templates/map/traditions-around-the-world/party-popper.svg', iconBgColor: '#fde68a', parent: 'carnival' },
  ],
};
