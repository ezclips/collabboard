import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-294. A finished freeform template, as data only. Every asset lives
 * under `/templates/freeform/character-profile/` (same-origin static files) and
 * has an entry in that folder's `credits.json`.
 */
export const CHARACTER_PROFILE: BoardTemplate = {
  id: 'character-profile',
  name: 'Character Profile',
  layout: 'freeform',
  previewUrl: '/templates/freeform/character-profile/preview.jpg',
  summary: 'Looks, traits and backstory of a character.',
  contents: ['Portrait', 'Traits and quirks', 'Backstory notes'],
  posts: [
    { kind: 'column', key: 'who', title: 'Who she is', x: 60, y: 60, width: 360, height: 800, topStrip: '#0f766e' },
    { kind: 'image', title: 'Mara Quill, 34', src: '/templates/freeform/character-profile/portrait.jpg', parent: 'who' },
    {
      kind: 'note',
      title: 'At a glance',
      html: '<p><strong>Role:</strong> navigator on the airship <em>Kestrel</em></p><p><strong>From:</strong> the harbour town of Low Wick</p><p><strong>Wants:</strong> to chart the storm belt no one has crossed</p><p><strong>Fears:</strong> being grounded for good</p>',
      parent: 'who',
    },
    { kind: 'clipart', title: 'Navigator', svg: '/templates/freeform/character-profile/compass.svg', iconBgColor: '#99f6e4', parent: 'who' },

    { kind: 'column', key: 'personality', title: 'Personality', x: 460, y: 60, width: 360, height: 800, topStrip: '#b45309' },
    { kind: 'image', title: 'Quick to laugh', src: '/templates/freeform/character-profile/portrait-pose.jpg', parent: 'personality' },
    {
      kind: 'note',
      title: 'Traits',
      html: '<ul><li>Curious, stubborn, generous</li><li>Talks to her instruments</li><li>Never lies to her crew</li></ul>',
      parent: 'personality',
    },
    {
      kind: 'note',
      title: 'Voice',
      html: '<p><em>“Maps are just promises someone kept.”</em></p>',
      parent: 'personality',
    },
    { kind: 'clipart', title: 'Backstory', svg: '/templates/freeform/character-profile/scroll.svg', iconBgColor: '#fde68a', parent: 'personality' },

    { kind: 'column', key: 'world', title: 'Her world', x: 860, y: 60, width: 360, height: 800, topStrip: '#6d28d9' },
    { kind: 'image', title: 'Her charts', src: '/templates/freeform/character-profile/map-compass.jpg', parent: 'world' },
    { kind: 'image', title: 'The storm belt at dusk', src: '/templates/freeform/character-profile/balloon-sunset.jpg', parent: 'world' },
    { kind: 'image', title: 'Festival day in Low Wick', src: '/templates/freeform/character-profile/balloon-peach.jpg', parent: 'world' },
    { kind: 'clipart', title: 'Places', svg: '/templates/freeform/character-profile/world-map.svg', iconBgColor: '#ddd6fe', parent: 'world' },

    {
      kind: 'todo',
      title: 'Story beats',
      x: 1260,
      y: 60,
      width: 320,
      height: 260,
      tasks: [
        { text: "Mara loses the Kestrel's charts", done: true },
        { text: 'A stranger offers a shortcut', done: false },
        { text: 'Into the storm belt', done: false },
        { text: 'She chooses the crew over the record', done: false },
        { text: 'Home to Low Wick', done: false },
      ],
    },
    {
      kind: 'table',
      title: 'Relationships',
      x: 1260,
      y: 360,
      width: 440,
      height: 200,
      rows: [
        ['Name', 'Who', 'Feeling'],
        ['Otto Fenn', 'Pilot, old friend', 'Trust'],
        ['Ines Varga', 'Rival navigator', 'Respect'],
        ['The harbourmaster', 'Her father', 'Unfinished'],
      ],
    },
    { kind: 'clipart', title: 'Rivalries', svg: '/templates/freeform/character-profile/crossed-swords.svg', iconBgColor: '#fecaca', x: 1620, y: 60, width: 180, height: 220 },
  ],
};
