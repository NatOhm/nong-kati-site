/**
 * Support Tickets API — customer → admin correspondence.
 * Customers submit from /account/support (session optional: guests can
 * include email/name); admins list/answer/close through /management/tickets
 * (tickets:read / tickets:write — held by support_agent and super_admin).
 */

import { createHmac, randomInt } from 'node:crypto';

import { prisma } from '@/lib/db';
import { checkPermission } from '@/lib/rbac';
import type { SupportTicket, AdminUser } from '@prisma/client';

const SECRET =
  process.env['NK_TICKET_SECRET'] ??
  process.env['NK_ORDER_SECRET'] ??
  process.env['NEXTAUTH_SECRET'] ??
  'nong-kati-ticket-fallback';

/** Human-friendly ticket number: NK-T-XXXXX (5 base32 chars, retry on collision). */
export async function nextTicketNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let suffix = '';
    for (let i = 0; i < 5; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
    const ticketNumber = `NK-T-${suffix}`;
    const exists = await prisma.supportTicket.findUnique({ where: { ticketNumber } });
    if (!exists) return ticketNumber;
  }
  // Practically unreachable; deterministic last resort.
  return `NK-T-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/** Verify a MAC protecting ticketNumber in customer-facing links. */
export function verifyTicketMac(ticketNumber: string, mac: string): boolean {
  const expected = createHmac('sha256', SECRET).update(ticketNumber).digest('hex').slice(0, 16);
  return mac === expected;
}

export function ticketMac(ticketNumber: string): string {
  return createHmac('sha256', SECRET).update(ticketNumber).digest('hex').slice(0, 16);
}

export interface CreateTicketInput {
  subject: string;
  message: string;
  email: string;
  name: string | null;
  customerId: string | null;
  ip: string;
}

export async function createSupportTicket(
  input: CreateTicketInput,
): Promise<{ ticket: SupportTicket } | { error: 'RATE_LIMITED' }> {
  // 5 tickets / 24h per email (reuses the auth limiter's in-memory windows).
  const { checkRateLimit } = await import('@/lib/rateLimit');
  const rl = checkRateLimit('_support_ticket_email', input.email, {
    route: '_support_ticket_email',
    maxRequests: 5,
    windowMs: 86_400_000,
    keyBy: 'email',
  });
  if (!rl.allowed) return { error: 'RATE_LIMITED' };

  const ticket = await prisma.supportTicket.create({
    data: {
      ticketNumber: await nextTicketNumber(),
      customerId: input.customerId,
      customerEmail: input.email,
      customerName: input.name,
      subject: input.subject,
      message: input.message,
      status: 'open',
    },
  });
  return { ticket };
}

export interface AdminTicketListItem {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  customerEmail: string;
  customerName: string | null;
  createdAt: string;
  answeredAt: string | null;
}

export async function adminListTickets(params: {
  status?: string;
  q?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: AdminTicketListItem[]; total: number; openCount: number }> {
  const where = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.q
      ? {
          OR: [
            { ticketNumber: { contains: params.q } },
            { subject: { contains: params.q } },
            { customerEmail: { contains: params.q } },
          ],
        }
      : {}),
  };

  const [rows, total, openCount] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.count({ where: { status: 'open' } }),
  ]);

  return {
    items: rows.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      status: t.status,
      customerEmail: t.customerEmail,
      customerName: t.customerName,
      createdAt: t.createdAt.toISOString(),
      answeredAt: t.answeredAt?.toISOString() ?? null,
    })),
    total,
    openCount,
  };
}

export interface AdminTicketDetail extends AdminTicketListItem {
  message: string;
  adminReply: string | null;
  answeredByName: string | null;
  closedAt: string | null;
}

export async function adminGetTicket(
  id: string,
): Promise<{ ticket: AdminTicketDetail; answeredBy?: AdminUser } | null> {
  const t = await prisma.supportTicket.findUnique({
    where: { id },
    include: { answeredBy: { select: { fullName: true } } },
  });
  if (!t) return null;
  return {
    ticket: {
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      status: t.status,
      customerEmail: t.customerEmail,
      customerName: t.customerName,
      createdAt: t.createdAt.toISOString(),
      answeredAt: t.answeredAt?.toISOString() ?? null,
      message: t.message,
      adminReply: t.adminReply,
      answeredByName: t.answeredBy?.fullName ?? null,
      closedAt: t.closedAt?.toISOString() ?? null,
    },
  };
}

export type TicketAction = 'reply' | 'close' | 'reopen';

export async function adminUpdateTicket(
  id: string,
  action: TicketAction,
  reply: string | undefined,
  adminId: string,
): Promise<{ ok: true } | { error: 'REPLY_REQUIRED' | 'NOT_FOUND' | 'BAD_STATE' }> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) return { error: 'NOT_FOUND' };

  if (action === 'reply') {
    if (!reply?.trim()) return { error: 'REPLY_REQUIRED' };
    await prisma.supportTicket.update({
      where: { id },
      data: {
        adminReply: reply.trim(),
        answeredById: adminId,
        answeredAt: new Date(),
        status: 'answered',
      },
    });
    return { ok: true };
  }

  if (action === 'close') {
    if (ticket.status === 'closed') return { error: 'BAD_STATE' };
    await prisma.supportTicket.update({
      where: { id },
      data: { status: 'closed', closedAt: new Date() },
    });
    return { ok: true };
  }

  // reopen: cleared reply state returns the ticket to the queue
  await prisma.supportTicket.update({
    where: { id },
    data: { status: 'open', adminReply: null, answeredById: null, answeredAt: null, closedAt: null },
  });
  return { ok: true };
}
