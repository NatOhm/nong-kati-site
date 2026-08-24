/**
 * PDPA Data Request API — 07-api.md §18, 02-user-flow.md UF-17.
 * Handles data subject requests: access, correct, delete, port.
 * 30-day SLA per PDPA B.E. 2562.
 */

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

// ─── Mock Store ──────────────────────────────────────────

const mockRequests: DataRequest[] = [];

// ─── API Functions ───────────────────────────────────────

/**
 * Submit a new data subject request.
 * 07-api.md §18 — POST /legal/data-requests
 */
export async function submitDataRequest(params: {
  type: DataRequestType;
  email: string;
  details: string;
}): Promise<{ success: boolean; data?: DataRequest; error?: string }> {
  // Validate
  if (!params.email || !params.email.includes('@')) {
    return { success: false, error: 'INVALID_EMAIL' };
  }

  if (!params.details || params.details.length < 10) {
    return { success: false, error: 'DETAILS_TOO_SHORT' };
  }

  const request: DataRequest = {
    id: `dpr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: params.type,
    email: params.email,
    details: params.details,
    status: 'pending',
    adminNotes: null,
    createdAt: new Date(),
    completedAt: null,
  };

  mockRequests.push(request);

  writeAuditLog({
    actorType: 'customer',
    actorId: params.email,
    actorEmail: params.email,
    action: `pdpa_${params.type}_request`,
    tableName: 'store.data_subject_requests',
    recordId: request.id,
    metadata: {
      type: params.type,
      email: params.email,
    },
  });

  return { success: true, data: request };
}

/**
 * List all data requests (admin view).
 * 07-api.md §18 — GET /admin/data-requests
 */
export async function listDataRequests(params: {
  status?: DataRequestStatus;
  page?: number;
  pageSize?: number;
}): Promise<{ data: DataRequest[]; total: number }> {
  const { status, page = 1, pageSize = 20 } = params;

  let filtered = [...mockRequests];
  if (status) {
    filtered = filtered.filter((r) => r.status === status);
  }

  const total = filtered.length;
  const offset = (page - 1) * pageSize;
  const data = filtered.slice(offset, offset + pageSize);

  return { data, total };
}

/**
 * Update a data request status (admin action).
 */
export async function updateDataRequest(
  requestId: string,
  params: {
    status: DataRequestStatus;
    adminNotes?: string;
  },
  adminId: string,
  adminEmail: string
): Promise<{ success: boolean; error?: string }> {
  const request = mockRequests.find((r) => r.id === requestId);
  if (!request) {
    return { success: false, error: 'REQUEST_NOT_FOUND' };
  }

  const previousStatus = request.status;
  request.status = params.status;
  if (params.adminNotes) request.adminNotes = params.adminNotes;
  if (params.status === 'completed') request.completedAt = new Date();

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: `pdpa_request_${params.status}`,
    tableName: 'store.data_subject_requests',
    recordId: requestId,
    diff: {
      before: { status: previousStatus },
      after: { status: params.status },
    },
  });

  return { success: true };
}
