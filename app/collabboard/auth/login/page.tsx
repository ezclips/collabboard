import { redirect } from 'next/navigation';

export default function CollabboardLoginPage() {
  redirect('/auth?mode=login&redirect=/collabboard');
}
