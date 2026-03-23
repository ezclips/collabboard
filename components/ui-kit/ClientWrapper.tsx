// components/ui-kit/ClientWrapper.tsx
"use client";
import Navbar from "./Navbar";

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
