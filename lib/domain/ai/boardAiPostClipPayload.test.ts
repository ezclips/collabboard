import { describe, expect, it } from 'vitest';

import {
  BOARD_AI_POST_CLIP_MIME,
  boardAiPostClipPayload,
  parseBoardAiPostClipPayload,
} from './boardAiPostClipPayload';

const ID = '6d7044fe-a2b7-45b9-9a4d-16c729caa500';

describe('the dragged post payload', () => {
  it('round-trips a padlet id', () => {
    expect(parseBoardAiPostClipPayload(boardAiPostClipPayload(ID))).toEqual({ padletId: ID });
  });

  it('uses its own transfer type, never text/plain', () => {
    // Every drag from every application carries text/plain. Honouring it would
    // let arbitrary dropped text impersonate a board post.
    expect(BOARD_AI_POST_CLIP_MIME).toBe('application/collabboard-board-post');
    expect(BOARD_AI_POST_CLIP_MIME).not.toBe('text/plain');
  });
});

describe('what it refuses', () => {
  it.each([
    ['nothing at all', null],
    ['an empty string', ''],
    ['text that is not JSON', 'just some dragged words'],
    ['a JSON array', '["' + ID + '"]'],
    ['a JSON scalar', '"' + ID + '"'],
    ['an object with no id', '{}'],
    ['an id that is not a string', '{"padletId":42}'],
    ['an id that is not a uuid', '{"padletId":"../../etc/passwd"}'],
  ])('%s', (_label, raw) => {
    expect(parseBoardAiPostClipPayload(raw as string | null)).toBeNull();
  });

  it('an absurdly long transfer, before it is parsed', () => {
    expect(parseBoardAiPostClipPayload('{"padletId":"' + 'a'.repeat(4000) + '"}')).toBeNull();
  });
});

describe('what the payload is NOT', () => {
  it('carries an id and nothing else -- no label, no text, no type', () => {
    // A drag payload that carried the post's text would make the transfer a
    // second source of truth about the post. The receiver resolves the id
    // against the board's own loaded posts, so there is nothing to disagree
    // with -- and a forged id resolves to nothing rather than to a fabricated
    // attachment.
    expect(Object.keys(JSON.parse(boardAiPostClipPayload(ID)))).toEqual(['padletId']);
  });
});
