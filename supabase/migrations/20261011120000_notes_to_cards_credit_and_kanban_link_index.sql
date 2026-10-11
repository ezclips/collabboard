-- PATCH-342 / PATCH-341. Applied by the owner in the Supabase SQL editor.
--
-- 1. AI credits: "Suggest cards with AI" (Send to Kanban) charges the new
--    feature 'notes_to_cards'. The ledger's feature check is the inline column
--    check from 20260926120000_ai_credit_usage.sql (default name
--    ai_credit_usage_feature_check); it is replaced with the same list plus
--    the new value. Until this runs, the charge write is refused and logged by
--    the route ("AI credit usage was not recorded"); the suggestion still works.
--
-- 2. "From brainstorm" (PATCH-341): a Kanban board finds the Freeform notes
--    sent to it with  metadata->'kanbanLink'->>'boardId' = <board id>.
--    This expression index keeps that one lookup per board load fast. The
--    expression matches what PostgREST generates for
--    .eq('metadata->kanbanLink->>boardId', ...). Nothing breaks without it.

-- Drop the existing feature check whatever it is called (found by what it
-- checks, not by its name, so a differently named constraint cannot survive
-- and keep refusing the new value).
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.ai_credit_usage'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%feature%'
  loop
    execute format('alter table public.ai_credit_usage drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.ai_credit_usage
  add constraint ai_credit_usage_feature_check check (feature in (
    'board_chat',
    'table_from_document',
    'wiki_compile',
    'text_action',
    'table_fill',
    'table_plan',
    'transcript_punctuate',
    'component',
    'notes_to_cards'
  ));

create index if not exists padlets_kanban_link_board_idx
  on public.padlets ((metadata->'kanbanLink'->>'boardId'));
