-- PATCH-356. AI credits: "Board setup assistant" charges the new feature
-- 'board_setup'. The ledger's feature check is the inline column check (default
-- name ai_credit_usage_feature_check, last set by
-- 20261013120000_notes_ai_credit.sql); it is replaced with the same list plus
-- the new value.
--
-- DO NOT APPLY from a coding session -- the owner runs this in the Supabase SQL
-- editor. Until it runs, the charge write is refused and logged by the route
-- ("AI credit usage was not recorded"); the feature still works, exactly as
-- PATCH-353 did before its migration.

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
    'notes_to_cards',
    'notes_ai',
    'board_setup'
  ));
