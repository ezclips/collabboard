"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import type { AuthUser } from "@/lib/domain/auth/user";
import { getSessionUser, onAuthUserChanged } from "@/lib/infra/supabase/authState";
import UserProfileDropdown from "@/components/UserProfileDropdown";

const navItems = [
  { name: "Home", href: "/" },
  { name: "Pricing", href: "/pricing" },
  { name: "Docs", href: "/docs" },
];

const Navbar: React.FC = () => {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Handle mounting
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle authentication
  useEffect(() => {
    if (!mounted) return;

    let isMounted = true;

    const initializeAuth = async () => {
      try {
        // Get current session
        const result = await getSessionUser();

        if (!result.ok) {
          console.error("Error getting session:", result.error);
        }

        if (isMounted) {
          setUser(result.ok ? result.value : null);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const unsubscribe = onAuthUserChanged((event, user) => {
        console.log('Navbar auth event:', event, user?.id);
        
        if (isMounted) {
          setUser(user);
          setIsLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [mounted]);

  // Don't render anything until mounted (prevents hydration issues)
  if (!mounted) {
    return (
      <header className="fixed top-0 left-0 w-full h-16 bg-white/95 backdrop-blur-md border-b border-border z-50 shadow-sm">
        <div className="container h-full flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold">
              CollabBoard
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle />
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 left-0 w-full h-16 bg-white/95 backdrop-blur-md border-b border-border z-50 shadow-sm">
      <div className="container h-full flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold">
            CollabBoard
          </Link>
          <nav className="hidden md:flex items-center gap-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-foreground/80",
                  pathname === item.href
                    ? "text-foreground"
                    : "text-foreground/60"
                )}
              >
                {item.name}
              </Link>
            ))}
            
            {/* Create Canvas button - only show when authenticated and not loading */}
            {!isLoading && user && (
              <Link
                href="/dashboard/create-canvas"
                className={cn(
                  "text-sm font-medium transition-colors hover:text-red-600/80 text-red-600",
                  pathname === "/dashboard/create-canvas"
                    ? "text-red-600"
                    : "text-red-600/80"
                )}
              >
                + Create Canvas
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle />
          
          {/* Show loading state */}
          {isLoading ? (
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
          ) : user ? (
            /* Show profile dropdown when authenticated */
            <UserProfileDropdown />
          ) : (
            /* Show login button when not authenticated */
            <Button size="sm" asChild>
              <Link href="/auth">Login</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;