import { NextRequest, NextResponse } from 'next/server';

import { createSupportTicket } from '@/api/supportTickets';
import { getCustomerFromToken } from '@/api/customerAuth';
import { prisma } from '@/lib/db';
import { getClientIp, checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const COOKIE = 'nk_session';

/**
 * GET /api/v1/account/support — the signed-in customer's tickets with any
 * admin replies (โต๊ะของคุณ list on the support page). Guests get an empty
 * list — they track their tickets by the ticket number returned at submit.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE)?.value;
  const session = token ? await getCustomerFromToken(token) : null;
  if (!session) {
    return NextResponse.json({ tickets: [] });
  }

  const tickets = await prisma.supportTicket.findMany({
    where: { customerId: session.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      status: true,
      createdAt: true,
      adminReply: true,
    },
  });

  return NextResponse.json({
    tickets: tickets.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/v1/account/support — submit a real support ticket.
 * Signed-in customers are linked automatically; guests may include
 * email+name in the body. Rate limits: 5/hour per IP, 5/24h per email.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  // 5 tickets / hour per IP (per-email 5/24h lives in createSupportTicket).
  const ipRl = await checkRateLimit('_support_ticket_ip', ip, {
    route: '_support_ticket_ip',
    maxRequests: 5,
    windowMs: 3_600_000,
    keyBy: 'ip',
  });
  if (!ipRl.allowed) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  let body: { subject?: unknown; message?: unknown; email?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!subject || subject.length > 200) {
    return NextResponse.json({ error: 'SUBJECT_REQUIRED' }, { status: 400 });
  }
  if (!message || message.length > 5000) {
    return NextResponse.json({ error: 'MESSAGE_REQUIRED' }, { status: 400 });
  }

  // Resolve the customer session (optional — guests can also submit).
  const token = req.cookies.get(COOKIE)?.value;
  const session = token ? await getCustomerFromToken(token) : null;

  let email: string;
  let name: string | null;
  if (session) {
    email = session.email;
    const customer = await prisma.customer.findUnique({
      where: { id: session.id },
      select: { fullName: true },
    });
    name = customer?.fullName ?? null;
  } else {
    const guestEmail = typeof body.email === 'string' ? body.email.trim() : '';
    const guestName = typeof body.name === 'string' ? body.name.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      return NextResponse.json({ error: 'EMAIL_REQUIRED' }, { status: 400 });
    }
    email = guestEmail;
    name = guestName || null;
  }

  const result = await createSupportTicket({
    subject,
    message,
    email,
    name,
    customerId: session?.id ?? null,
    ip,
  });
  if ('error' in result) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  return NextResponse.json({
    ticketNumber: result.ticket.ticketNumber,
    createdAt: result.ticket.createdAt.toISOString(),
  });
}
