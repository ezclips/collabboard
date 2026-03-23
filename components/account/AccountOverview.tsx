// components/account/AccountOverview.tsx

"use client";

import { useCurrentUser } from "@/lib/hooks/useCurrentUser";

export default function AccountOverview() {
  const { user, loading } = useCurrentUser();

  if (loading) return <p>Loading...</p>;
  if (!user) return <p>No user found.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Account Overview</h1>
      <div className="p-4 border rounded">
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>ID:</strong> {user.id}</p>
        {/* Add more fields if you fetch from `profiles` table */}
      </div>
    </div>
  );
}
