import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';

/**
 * PATCH-296. A finished Timeline template, as data only. Every asset lives
 * under `/templates/timeline/history-of-flight/` with a matching entry in
 * that folder's `credits.json`.
 */
export const HISTORY_OF_FLIGHT: BoardTemplate = {
  id: 'history-of-flight',
  name: 'History of Flight',
  layout: 'timeline',
  previewUrl: '/templates/timeline/history-of-flight/preview.jpg',
  summary: 'From the Wright brothers to the Moon.',
  contents: ['Dated milestones 1903–1969', 'Photos'],
  posts: [
    { kind: 'column', key: 'balloon', title: 'The first hot-air balloon flight', timelineLabel: '1783' },
    { kind: 'image', title: 'Hot air rises', src: '/templates/timeline/history-of-flight/balloon.jpg', parent: 'balloon' },
    {
      kind: 'note',
      title: 'Paris',
      html: "<p>The Montgolfier brothers' balloon carries two passengers over Paris — the first people to fly.</p>",
      parent: 'balloon',
    },

    { kind: 'column', key: 'glider', title: 'Gliding like a bird', timelineLabel: '1891' },
    { kind: 'image', title: 'A modern glider', src: '/templates/timeline/history-of-flight/glider.jpg', parent: 'glider' },
    {
      kind: 'note',
      title: 'Otto Lilienthal',
      html: '<p>Otto Lilienthal begins about 2,000 glider flights in Germany and studies how wings lift.</p>',
      parent: 'glider',
    },

    { kind: 'column', key: 'wright', title: 'The first powered flight', timelineLabel: '1903' },
    { kind: 'image', title: 'Early planes had two wings', src: '/templates/timeline/history-of-flight/biplane.jpg', parent: 'wright' },
    {
      kind: 'note',
      title: 'Kitty Hawk',
      html: '<p>Orville and Wilbur Wright fly the Wright Flyer for 12 seconds and 37 metres at Kitty Hawk, North Carolina.</p>',
      parent: 'wright',
    },
    { kind: 'clipart', title: 'Flight!', svg: '/templates/timeline/history-of-flight/airplane.svg', iconBgColor: '#bae6fd', parent: 'wright' },

    { kind: 'column', key: 'lindbergh', title: 'Across the Atlantic alone', timelineLabel: '1927' },
    {
      kind: 'note',
      title: 'Charles Lindbergh',
      html: '<p>Charles Lindbergh flies non-stop from New York to Paris in 33½ hours.</p>',
      parent: 'lindbergh',
    },
    { kind: 'clipart', title: '33½ hours', svg: '/templates/timeline/history-of-flight/hourglass-done.svg', iconBgColor: '#fde68a', parent: 'lindbergh' },

    { kind: 'column', key: 'jet', title: 'The jet age', timelineLabel: '1958' },
    { kind: 'image', title: 'Jets made travel faster', src: '/templates/timeline/history-of-flight/airliner.jpg', parent: 'jet' },
    {
      kind: 'note',
      title: 'Jets',
      html: '<p>Jet airliners start regular flights across the Atlantic, and flying becomes part of everyday life.</p>',
      parent: 'jet',
    },

    { kind: 'column', key: 'moon', title: 'People on the Moon', timelineLabel: '1969' },
    { kind: 'image', title: 'Rockets carry people into space', src: '/templates/timeline/history-of-flight/rocket.jpg', parent: 'moon' },
    {
      kind: 'note',
      title: 'Apollo 11',
      html: '<p>Apollo 11 lands on the Moon. Neil Armstrong and Buzz Aldrin walk on its surface.</p>',
      parent: 'moon',
    },
    { kind: 'clipart', title: 'One giant leap', svg: '/templates/timeline/history-of-flight/rocket.svg', iconBgColor: '#c7d2fe', parent: 'moon' },

    { kind: 'column', key: 'iss', title: 'A home in orbit', timelineLabel: '1998' },
    { kind: 'clipart', title: 'Space station', svg: '/templates/timeline/history-of-flight/satellite.svg', iconBgColor: '#e9d5ff', parent: 'iss' },
    {
      kind: 'note',
      title: 'The ISS',
      html: '<p>The first part of the International Space Station is launched. People have lived on board without a break since 2000.</p>',
      parent: 'iss',
    },
  ],
};
