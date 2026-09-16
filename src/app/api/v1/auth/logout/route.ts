import { NextRequest, NextResponse } from 'next/server';
import { logoutCustomer, getCustomerFromToken } from '@/api/customerAuth';

const COOKIE = 'nk_session';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (token) {
    const customer = await getCustomerFromToken(token);
    if (customer) await logoutCustomer(customer.id);
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
  return res;
}
