import type { Metadata } from "next";
import "./globals.css";
import { SupabaseProvider } from "@/lib/supabase-provider";
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
            <ClientLayout>
              {children}
            </ClientLayout>
          </SupabaseProvider>
        </div>
      </body>
    </html>
  );
}
