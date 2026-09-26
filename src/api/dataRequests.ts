/**
 * PDPA Data Request API — 07-api.md §18, 02-user-flow.md UF-17.
 * SERVER-ONLY: persisted in the DataSubjectRequest table (security review
 * 2026-09-26 — the previous in-memory array lost every request on restart
 * and never reached the admin console). 30-day SLA per PDPA B.E. 2562.
 */

import { randomBytes } from 'node:crypto';

import { prisma } from '@/lib/db';
import { writeAuditLog } from '@/lib/auditLog';

// ─── Types ──────────────────────────────────────────────

export type DataRequestType = 'access' | 'correct' | 'delete' | 'port';

export type DataRequestStatus = 'pending' | 'processing' | 'completed' | 'rejected';

export type DataRequest = {
  id: string;
  type: DataRequestType;
  email: string;
  details: string;
  status: DataRequestStatus;
  adminNotes: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

const VALID_TYPES: DataRequestType[] = ['access', 'correct', 'delete', 'port'];
const VALID_STATUSES: DataRequestStatus[] = ['pending', 'processing', 'completed', 'rejected'];

function toDto(row: {
  requestId: string;
  requestType: string;
  email: string;
  details: string | null;
  status: string;
  adminNote: string | null;
  createdAt: Date;
  handledAt: Date | null;
}): DataRequest {
  return {
    id: row.requestId,
    type: row.requestType as DataRequestType,
    email: row.email,
    details: row.details ?? '',
    status: row.status as DataRequestStatus,
    adminNotes: row.adminNote,
    createdAt: row.createdAt,
    completedAt: row.handledAt,
  };
}

// ─── API Functions ───────────────────────────────────────

/**
 * Submit a new data subject request.
 * 07-api.md §18 — POST /api/v1/pdpa/data-requests
 */
export async function submitDataRequest(params: {
  type: DataRequestType;
  email: string;
  details: string;
  fullName?: string;
  phone?: string;
}): Promise<{ success: boolean; data?: DataRequest; error?: string }> {
  if (!VALID_TYPES.includes(params.type)) {
    return { success: false, error: 'INVALID_TYPE' };
  }
  if (!params.email || !params.email.includes('@')) {
    return { success: false, error: 'INVALID_EMAIL' };
  }
  if (!params.details || params.details.length < 10) {
    return { success: false, error: 'DETAILS_TOO_SHORT' };
  }

  const requestId = `dpr_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const row = await prisma.dataSubjectRequest.create({
    data: {
      requestId,
      requestType: params.type,
      fullName: params.fullName?.trim() || params.email.split('@')[0]!,
      email: params.email.trim().toLowerCase(),
      phone: params.phone?.trim() || null,
      details: params.details.trim(),
      status: 'pending',
    },
  });

  writeAuditLog({
    actorType: 'customer',
    actorId: row.email,
    actorEmail: row.email,
    action: `pdpa_${params.type}_request`,
    tableName: 'DataSubjectRequest',
    recordId: row.id,
    metadata: { type: params.type, email: row.email },
  });

  return { success: true, data: toDto(row) };
}

/**
 * List data requests (admin view) — call from the pdpa:read-gated route.
 */
export async function listDataRequests(params: {
  status?: DataRequestStatus;
  page?: number;
  pageSize?: number;
}): Promise<{ data: DataRequest[]; total: number }> {
  const { status, page = 1, pageSize = 50 } = params;

  const where = status ? { status } : {};
  const [rows, total] = await Promise.all([
    prisma.dataSubjectRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.dataSubjectRequest.count({ where }),
  ]);

  return { data: rows.map(toDto), total };
}

/**
 * Update a data request status (admin action) — pdpa:action gate.
 */
export async function updateDataRequest(
  requestId: string,
  params: {
    status: DataRequestStatus;
    adminNotes?: string;
  },
  adminId: string,
  adminEmail: string,
): Promise<{ success: boolean; error?: string }> {
  if (!VALID_STATUSES.includes(params.status)) {
    return { success: false, error: 'INVALID_STATUS' };
  }

  const existing = await prisma.dataSubjectRequest.findUnique({
    where: { requestId },
  });
  if (!existing) return { success: false, error: 'REQUEST_NOT_FOUND' };

  const row = await prisma.dataSubjectRequest.update({
    where: { requestId },
    data: {
      status: params.status,
      adminNote: params.adminNotes ?? existing.adminNote,
      handledById: adminId,
      handledAt: params.status === 'completed' ? new Date() : existing.handledAt,
    },
  });

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: `pdpa_request_${params.status}`,
    tableName: 'DataSubjectRequest',
    recordId: row.id,
    diff: { before: { status: existing.status }, after: { status: params.status } },
  });

  return { success: true };
}
