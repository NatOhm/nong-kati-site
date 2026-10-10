import { NextRequest } from 'next/server';

import { GET_customerHistory } from '../../../orders/search';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return GET_customerHistory(req, ctx);
}

export const dynamic = 'force-dynamic';
