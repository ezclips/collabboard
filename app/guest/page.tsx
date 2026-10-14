import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

import { isGuestUser } from '@/lib/domain/auth/guest';

/**
 * PATCH-358. The guest home. A guest may open the board canvases they joined,
 * but not the rest of the dashboard (the middleware sends them here). This page
 * lists those boards; a non-guest is sent to the dashboard and an unsigned
 * visitor to the login page.
 */
export default async function GuestPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient({ cookies: () => cookieStore as any });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth');
  if (!isGuestUser(user)) redirect('/dashboard');

  const metadata = user.user_metadata as { display_name?: unknown } | undefined;
  const displayName = typeof metadata?.display_name === 'string' && metadata.display_name.length > 0
    ? metadata.display_name
    : 'there';

  // RLS decides what this guest may see; a missing FK/embed or an empty result
  // both fall through to the "open your link" message.
  const { data: rows } = await supabase
    .from('board_collaborators')
    .select('board_id, boards(title)')
    .eq('user_id', user.id);

  const boards = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const raw = row as { board_id?: unknown; boards?: unknown };
      const id = typeof raw.board_id === 'string' ? raw.board_id : null;
      if (!id) return null;
      const embedded = Array.isArray(raw.boards) ? raw.boards[0] : raw.boards;
      const title = (embedded as { title?: unknown } | null | undefined)?.title;
      return { id, title: typeof title === 'string' ? title : 'Untitled board' };
    })
    .filter((board): board is { id: string; title: string } => board !== null);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-xl font-semibold text-gray-900">You&apos;re visiting as a guest</h1>
        <p className="mt-1 text-sm text-gray-500">Signed in as {displayName}.</p>

        {boards.length > 0 ? (
          <ul data-guest-boards="true" className="mt-6 space-y-2">
            {boards.map((board) => (
              <li key={board.id}>
                <Link
                  href={`/dashboard/canvas/${board.id}`}
                  className="block rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800 hover:border-blue-300 hover:bg-blue-50"
                >
                  {board.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p data-guest-empty="true" className="mt-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
            Open the link you were given to get back to your board.
          </p>
        )}

        <p className="mt-8 text-center text-sm text-gray-500">
          <Link
            href="/auth?mode=signup&switch=1"
            className="font-medium text-blue-600 hover:underline"
          >
            Create a free account
          </Link>
        </p>
      </div>
    </div>
  );
}
