import { redirect } from 'next/navigation';

export default function CollabboardForgotPasswordPage() {
  redirect('/auth?mode=reset&redirect=/collabboard');
}
