import { NextRequest } from 'next/server';
import { handleOAuthCallback } from '../handler';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const resolvedParams = await params;
  return handleOAuthCallback(req, resolvedParams.provider);
}
