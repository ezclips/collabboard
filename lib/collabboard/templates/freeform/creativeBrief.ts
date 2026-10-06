import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-294. A finished freeform template, as data only. Every asset lives
 * under `/templates/freeform/creative-brief/` (same-origin static files) and
 * has an entry in that folder's `credits.json`.
 */
export const CREATIVE_BRIEF: BoardTemplate = {
  id: 'creative-brief',
  name: 'Creative Brief',
  layout: 'freeform',
  previewUrl: '/templates/freeform/creative-brief/preview.jpg',
  posts: [
    { kind: 'column', key: 'brief', title: 'The brief', x: 60, y: 60, width: 360, height: 800, topStrip: '#2563eb' },
    {
      kind: 'note',
      title: 'Lumen Bikes · Spring campaign',
      html: '<p><strong>Lumen Bikes · Spring campaign</strong></p><p><strong>Product:</strong> Lumen City, an e-bike for daily commuting.</p><p><strong>Goal:</strong> 2,000 test rides booked in April and May.</p><p><strong>Audience:</strong> city commuters aged 25–45 who drive or take the bus today.</p>',
      parent: 'brief',
    },
    {
      kind: 'note',
      title: 'Key message',
      html: '<p><em>“Your commute, in a better light.”</em></p>',
      parent: 'brief',
    },
    { kind: 'clipart', title: 'Message', svg: '/templates/freeform/creative-brief/megaphone.svg', iconBgColor: '#bfdbfe', parent: 'brief' },
    {
      kind: 'todo',
      title: 'Deliverables',
      tasks: [
        { text: 'Three key visuals', done: true },
        { text: '15-second video', done: false },
        { text: 'Twelve social posts', done: false },
        { text: 'Shop window poster', done: false },
        { text: 'Test-ride landing page', done: false },
      ],
      parent: 'brief',
    },

    { kind: 'column', key: 'visual', title: 'Visual direction', x: 460, y: 60, width: 360, height: 800, topStrip: '#0891b2' },
    { kind: 'image', title: 'Real commuters, real streets', src: '/templates/freeform/creative-brief/ebike-commuter.jpg', parent: 'visual' },
    { kind: 'image', title: 'Motion, not studio', src: '/templates/freeform/creative-brief/city-ride.jpg', parent: 'visual' },
    {
      kind: 'note',
      title: 'Tone',
      html: '<p><strong>Tone</strong></p><ul><li>Bright, optimistic, everyday</li><li>Morning and evening light</li><li>No lycra, no racing</li></ul>',
      parent: 'visual',
    },
    { kind: 'clipart', title: 'Idea', svg: '/templates/freeform/creative-brief/light-bulb.svg', iconBgColor: '#fef08a', parent: 'visual' },

    { kind: 'column', key: 'moments', title: 'Campaign moments', x: 860, y: 60, width: 360, height: 800, topStrip: '#7c3aed' },
    { kind: 'image', title: 'The ride home', src: '/templates/freeform/creative-brief/evening-ride.jpg', parent: 'moments' },
    { kind: 'image', title: 'Built-in lights', src: '/templates/freeform/creative-brief/light-trails.jpg', parent: 'moments' },
    {
      kind: 'note',
      title: 'Mandatories',
      html: '<p><strong>Mandatories</strong></p><ul><li>Logo bottom right</li><li>“Book a free test ride” on every asset</li><li>From €2,490</li></ul>',
      parent: 'moments',
    },
    { kind: 'clipart', title: 'Timeline', svg: '/templates/freeform/creative-brief/spiral-calendar.svg', iconBgColor: '#e9d5ff', parent: 'moments' },

    {
      kind: 'table',
      title: 'Timeline',
      x: 1260,
      y: 60,
      width: 440,
      height: 260,
      rows: [
        ['Phase', 'Date', 'Owner'],
        ['Kick-off', '3 March', 'Agency'],
        ['First concepts', '17 March', 'Agency'],
        ['Photo and video shoot', '31 March – 2 April', 'Production'],
        ['Launch', '14 April', 'Lumen'],
        ['Results report', '30 May', 'Agency'],
      ],
    },
    { kind: 'clipart', title: 'Lumen City', svg: '/templates/freeform/creative-brief/bicycle.svg', iconBgColor: '#bae6fd', x: 1260, y: 360, width: 180, height: 220 },
  ],
};
