import { notFound } from 'next/navigation';

import AntvExcalidrawHarnessClient from '@/components/ai/dev/AntvExcalidrawHarnessClient';

/**
 * PATCH-277. Developer-only route for the AntV -> Excalidraw harness. It is not
 * linked from anywhere and 404s in production.
 *
 * Addendum 2: the harness is rendered through a Client Component wrapper
 * (`AntvExcalidrawHarnessClient`) that owns the `ssr: false` dynamic import;
 * `ssr: false` is not allowed in a Server Component. The Excalidraw package is
 * never evaluated during server rendering.
 *
 * `?t=<template>&theme=<id>&pill=polygon` shows one design on its own.
 */
export default async function AntvExcalidrawFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; theme?: string; pill?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  return (
    <AntvExcalidrawHarnessClient template={params.t} theme={params.theme} pill={params.pill} />
  );
}
