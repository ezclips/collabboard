import type { Metadata } from "next";
import "./globals.css";
import { SupabaseProvider } from "@/lib/supabase-provider";
import { KnowledgePageCacheProvider } from "@/components/collabboard/KnowledgePageCache";
import ClientLayout from "@/components/ClientLayout";
import { Toaster } from "sonner";

// ❌ Remove server-side layout initialization
// Layouts will be initialized in ClientLayout.tsx on the client-side

export const metadata: Metadata = {
  title: "CollabBoard",
  description: "Collaborative workspace for teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased"
        suppressHydrationWarning={true}
      >
        <div suppressHydrationWarning>
          <SupabaseProvider>
            <Toaster position="top-center" richColors />
            {/* Inside SupabaseProvider because the cache is scoped to the
                authenticated user, and at the ROOT because this is the one
                client host that survives navigating away from a canvas and
                back -- which is exactly when the reload was visible. */}
            <KnowledgePageCacheProvider>
              <ClientLayout>
                {children}
              </ClientLayout>
            </KnowledgePageCacheProvider>
          </SupabaseProvider>
        </div>
      </body>
    </html>
  );
}
