import { NextRequest } from 'next/server';

import { GET_search } from '../search';

export async function GET(req: NextRequest) {
  return GET_search(req);
}

export const dynamic = 'force-dynamic';
