import { z } from 'zod';

/**
 * PATCH-344. The one client-side reader of `GET /api/billing/usage/history`
 * (rule 1: components make no raw network calls). The response is zod-parsed,
 * so a malformed body is a plain failure rather than a broken table.
 */

const entrySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  feature: z.string(),
  featureLabel: z.string(),
  boardId: z.string().nullable(),
  boardTitle: z.string().nullable(),
  boardGone: z.boolean(),
  byYou: z.boolean(),
  credits: z.number(),
  bucket: z.enum(['allowance', 'grant']),
});

const pageSchema = z.object({
  entries: z.array(entrySchema),
  nextBefore: z.string().nullable(),
});

export type AiUsageHistoryEntry = z.infer<typeof entrySchema>;
export type AiUsageHistoryPage = z.infer<typeof pageSchema>;

const UNAVAILABLE = 'Usage history is unavailable right now.';

export async function fetchAiUsageHistory(
  params: { before?: string | null; limit?: number } = {},
): Promise<AiUsageHistoryPage> {
  const search = new URLSearchParams();
  if (params.before) search.set('before', params.before);
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();

  const response = await fetch(`/api/billing/usage/history${query ? `?${query}` : ''}`);
  if (!response.ok) throw new Error(UNAVAILABLE);

  const body = await response.json().catch(() => null);
  const parsed = pageSchema.safeParse(body);
  if (!parsed.success) throw new Error(UNAVAILABLE);
  return parsed.data;
}
