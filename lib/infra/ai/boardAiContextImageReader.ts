// The byte fetch for an attached PDF-area crop. SERVER ONLY.
//
// This is the ONLY privileged read anywhere on the Board AI chat path, and it
// is deliberately the narrowest thing that can be called privileged: it takes a
// path string and returns bytes. It has no board id, no user id, no table and
// no query, so it cannot answer -- or be tricked into answering -- any question
// about who may read what.
//
// WHY IT EXISTS AT ALL. A PDF-area crop lives in the PRIVATE `knowledge-documents`
// bucket, which is exactly why a crop has no public URL and is served instead
// by a route that re-authorises on every request. The browser role genuinely
// cannot read that object, so something has to, and that something is here.
//
// WHY IT IS NOT IN THE ROUTE. `app/api/boards/[id]/ai/chat/route.ts` carries a
// standing guard -- asserted from three separate tests -- that it contains no
// admin client at all, because a chat nobody else may read is not a chat the
// server reads around. That guard is correct and is left untouched. Confining
// the admin client to this module keeps the route honest AND makes the
// privileged surface one named, reviewable function instead of a client in
// scope beside every other line of the handler.
//
// WHAT MAKES IT SAFE is upstream and not negotiable here: by the time this is
// called, the resolver has already proved -- with the CALLER'S OWN client -- that
// the padlet exists on the route board and that its metadata parses as genuine
// PDF-area provenance, and it has DERIVED the path from two validated UUIDs.
// This function must never be given a path that came from user data.

import { getSupabaseAdmin } from '../../supabase/admin';
import { KNOWLEDGE_STORAGE_BUCKET } from '../knowledge/knowledgeIngestionAdapters';
import { domainError } from '../../domain/core/errors';
import { err, ok } from '../../domain/core/result';
import type { BoardAiContextByteReader } from '../../server/ai/boardAiChatContext';

export function createBoardAiContextImageReader(): BoardAiContextByteReader {
  return {
    async download(path: string) {
      try {
        const { data, error } = await getSupabaseAdmin()
          .storage.from(KNOWLEDGE_STORAGE_BUCKET)
          .download(path);
        // A missing object and an unreachable bucket are one answer. The
        // resolver turns this into `unavailable` for the caller, which tells a
        // prober nothing about whether an object exists.
        if (error || !data) return err(domainError('unavailable', 'Could not read the attached image'));
        return ok({ bytes: new Uint8Array(await data.arrayBuffer()) });
      } catch {
        return err(domainError('unavailable', 'Could not read the attached image'));
      }
    },
  };
}
