import { notFound } from 'next/navigation';

import AiDrawnHarnessClient from '@/components/ai/dev/AiDrawnHarnessClient';

/**
 * PATCH-283 I + Addendum 1. Developer-only route for the AI-drawn picture spike.
 * Not linked from anywhere and 404s in production.
 *
 * `?kind=<k>&seed=<n>&examples=0|1&reasoning=off|auto&board=<uuid>` runs one
 * picture; with no `kind` the harness runs the battery (6 kinds x seeds 0,1,2).
 * `?export=examples` renders the AntV example templates with no AI call.
 *
 * Addendum 1: the route charges the board's credits, so a real `board` UUID is
 * required for any run that calls the model. The page validates its shape and,
 * without it, shows a message instead of letting the harness call and 402.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AiDrawnFixturePage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    seed?: string;
    examples?: string;
    reasoning?: string;
    board?: string;
    export?: string;
  }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;

  // The example export renders AntV and converts locally; it makes no AI call, so
  // it needs no board.
  if (params.export === 'examples') return <AiDrawnHarnessClient {...params} />;

  if (!params.board || !UUID_PATTERN.test(params.board)) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>AI-drawn pictures spike (dev only)</h1>
        <p style={{ fontSize: 14, color: '#b91c1c' }}>
          A board UUID is required, because the route charges the board&apos;s AI credits.
        </p>
        <p style={{ fontSize: 13, color: '#374151' }}>
          Add <code>?board=&lt;uuid&gt;</code> to the URL (plus optional{' '}
          <code>&amp;kind=&lt;kind&gt;&amp;seed=0&amp;examples=1&amp;reasoning=off</code>).
        </p>
      </main>
    );
  }

  return <AiDrawnHarnessClient {...params} />;
}
