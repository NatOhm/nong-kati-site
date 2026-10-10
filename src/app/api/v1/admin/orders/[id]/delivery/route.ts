import { NextRequest } from 'next/server';

import { GET_delivery } from '../../search';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return GET_delivery(req, ctx);
}

export const dynamic = 'force-dynamic';
