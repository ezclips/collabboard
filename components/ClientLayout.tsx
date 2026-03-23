'use client';

import { useEffect } from 'react';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // ✅ This registers layouts like "wall" in the client browser
    console.log('ClientLayout: Initializing layouts...');
  }, []);

  return <>{children}</>;
}