import CanvasClient from './CanvasClient';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ openPadlet?: string }>;
}) {
  const { id } = await params;
  const { openPadlet } = await searchParams;

  return <CanvasClient canvasId={id} openPadletId={openPadlet} />;
}
