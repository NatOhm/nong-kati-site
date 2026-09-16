import { NextRequest, NextResponse } from 'next/server';
import { getCustomerFromToken, getCustomerProfile } from '@/api/customerAuth';

const COOKIE = 'nk_session';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ customer: null });

  const session = await getCustomerFromToken(token);
  if (!session) return NextResponse.json({ customer: null });

  const profile = await getCustomerProfile(session.id);
  return NextResponse.json({ customer: profile });
}
