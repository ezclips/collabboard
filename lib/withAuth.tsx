"use client";

import React, { ComponentType, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface WithAuthProps {
  user: User;
}

export function withAuth<P extends WithAuthProps>(
  WrappedComponent: ComponentType<P>
): ComponentType<Omit<P, keyof WithAuthProps>> {
  return function WithAuthComponent(props: Omit<P, keyof WithAuthProps>) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
      const checkUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/collabboard/auth/login');
          return;
        }
        setUser(user);
        setLoading(false);
      };

      checkUser();

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          if (!session?.user) {
            router.push('/collabboard/auth/login');
          } else {
            setUser(session.user);
          }
        }
      );

      return () => subscription.unsubscribe();
    }, [router]);

    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      );
    }

    if (!user) {
      return null;
    }

    return <WrappedComponent {...(props as P)} user={user} />;
  };
}

export default withAuth;
