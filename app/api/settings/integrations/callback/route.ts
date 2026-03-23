import { NextRequest } from 'next/server';
import { handleOAuthCallback } from './handler';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return handleOAuthCallback(req);
}
