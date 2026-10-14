import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-363. A source guard over the board presence channel migration.
 *
 * The migration is not run here (supabase/** is outside vitest's execution
 * globs), so this pins the parts that must not drift: the topic regex, the two
 * authorisers, the revoke/grant and both realtime.messages policies.
 */

const MIGRATION_PATH = 'supabase/migrations/20261014170000_board_presence_channel.sql';
const source = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf8');

describe('PATCH-363 board presence channel migration', () => {
  it('accepts only a board:<uuid> topic', () => {
    expect(source).toContain('^board:[0-9a-f-]{36}$');
    expect(source).toContain('substring(topic from 7)::uuid');
    // Malformed text never raises.
    expect(source).toContain('EXCEPTION WHEN invalid_text_representation');
  });

  it('authorises through get_board_permission and the Kanban fallback', () => {
    expect(source).toContain('public.get_board_permission(board_id, auth.uid()) IS NOT NULL');
    expect(source).toContain('FROM public.kanban_board_members');
    expect(source).toContain('canvas_id = board_id AND user_id = auth.uid()');
  });

  it('is not an anonymous oracle', () => {
    expect(source).toContain('REVOKE ALL ON FUNCTION public.can_join_board_channel(text) FROM PUBLIC, anon;');
    expect(source).toContain('GRANT EXECUTE ON FUNCTION public.can_join_board_channel(text) TO authenticated;');
  });

  it('has both realtime.messages policies', () => {
    expect(source).toContain('CREATE POLICY board_channel_receive ON realtime.messages');
    expect(source).toContain('CREATE POLICY board_channel_send ON realtime.messages');
    expect(source).toContain('DROP POLICY IF EXISTS board_channel_receive ON realtime.messages;');
    expect(source).toContain('DROP POLICY IF EXISTS board_channel_send ON realtime.messages;');
    expect(source).toContain("realtime.messages.extension IN ('presence', 'broadcast')");
    expect(source).toContain('public.can_join_board_channel((select realtime.topic()))');
  });

  it('runs in one transaction', () => {
    expect(source).toContain('BEGIN;');
    expect(source).toContain('COMMIT;');
  });
});
