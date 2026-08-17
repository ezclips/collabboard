import { notFound } from 'next/navigation';

/** Normal builds never expose the Drawing resize browser fixture. */
export default function DrawingResizeFixtureUnavailable() {
  notFound();
  return null;
}
