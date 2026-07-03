import { redirect } from 'next/navigation';

export default function CollabboardRegisterPage() {
  redirect('/auth?mode=signup&redirect=/collabboard');
}
