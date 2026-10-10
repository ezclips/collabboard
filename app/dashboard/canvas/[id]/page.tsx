import CanvasClient from './CanvasClient';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ openPadlet?: string; openCard?: string }>;
}) {
  const { id } = await params;
  const { openPadlet, openCard } = await searchParams;

  return <CanvasClient canvasId={id} openPadletId={openPadlet} openCardId={openCard} />;
}
