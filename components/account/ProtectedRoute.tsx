'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/lib/supabase-provider';

type ProtectedRouteProps = {
  children: React.ReactNode;
};

/**
 * A client-side component that protects a route from unauthenticated access.
 * It checks for a valid user session using Supabase.
 * If no session is found, it displays a message prompting the user to log in.
 * Otherwise, it renders the child components.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { supabase } = useSupabase();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null); // Using `any` to be flexible with session object type

  useEffect(() => {
    /**
     * Fetches the current session and sets up a listener for auth state changes.
     */
    const checkSession = async () => {
      // Fetch session data from Supabase
      const { data } = await supabase.auth.getSession();
      setSession(data?.session || null);
      setLoading(false); // Finished loading
    };

    checkSession();

    // Listen for changes in authentication state (e.g., login, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Cleanup the subscription when the component unmounts
    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  // While the session is being checked, you can render a loading indicator.
  // Returning null for a cleaner initial load.
  if (loading) {
    return null;
  }

  // If loading is complete and there is no user session, show the login prompt.
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
          <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Please log in</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-300">You need to be authenticated to access this page.</p>
          <button
            onClick={() => router.push('/auth')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // If a session exists, render the protected content.
  return <>{children}</>;
}
