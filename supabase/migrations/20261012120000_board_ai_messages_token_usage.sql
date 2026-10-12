-- PATCH-345. Token counts on Board AI answers, so a user running on their own
-- API key can see what a conversation used.
--
-- Nullable: rows written before this patch, and answers from a provider that
-- reported no usage, have no counts. They are display-only numbers about the
-- user's OWN conversation; they never decide billing (credits live in
-- ai_credit_usage, written only by the service role). The existing
-- board_ai_messages RLS policies apply unchanged.

alter table public.board_ai_messages
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer;

alter table public.board_ai_messages
  drop constraint if exists board_ai_messages_input_tokens_check,
  add constraint board_ai_messages_input_tokens_check
    check (input_tokens is null or input_tokens >= 0),
  drop constraint if exists board_ai_messages_output_tokens_check,
  add constraint board_ai_messages_output_tokens_check
    check (output_tokens is null or output_tokens >= 0);
