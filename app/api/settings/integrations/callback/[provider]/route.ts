import { NextRequest } from 'next/server';
import { handleOAuthCallback } from '../handler';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  return handleOAuthCallback(req, params.provider);
}
