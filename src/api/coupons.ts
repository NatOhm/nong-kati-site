/**
 * Coupon API — 07-api.md §25, 01-prd.md FF-001.
 * Full coupon engine: CRUD, validation, discount calculation.
 * Uses mock data for M11 (Prisma in production).
 */

import { writeAuditLog } from '@/lib/auditLog';

// ─── Types ──────────────────────────────────────────────

export type CouponDiscountType = 'percentage';
export type CouponScope = 'cart' | 'product' | 'category';

export type Coupon = {
  id: string;
  code: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: number;
  scope: CouponScope;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
  isActive: boolean;
  usageCount: number;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CouponValidationResult = {
  valid: boolean;
  coupon?: Coupon;
  discountAmount?: number;
  error?: string;
};

// ─── Mock Store ──────────────────────────────────────────

const mockCoupons: Coupon[] = [
  {
    id: 'coupon-001',
    code: 'SUMMER10',
    description: 'ลด 10% ทุกสินค้า',
    discountType: 'percentage',
    discountValue: 10,
    scope: 'cart',
    applicableProductIds: [],
    applicableCategoryIds: [],
    isActive: true,
    usageCount: 142,
    usageLimit: 500,
    perCustomerLimit: 1,
    startsAt: new Date('2026-06-01T00:00:00Z'),
    expiresAt: new Date('2026-08-31T23:59:59Z'),
    createdBy: 'staff-001',
    createdAt: new Date('2026-05-28T10:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  },
  {
    id: 'coupon-002',
    code: 'WELCOME5',
    description: 'ส่วนลด 5% สำหรับสมาชิกใหม่',
    discountType: 'percentage',
    discountValue: 5,
    scope: 'cart',
    applicableProductIds: [],
    applicableCategoryIds: [],
    isActive: true,
    usageCount: 0,
    usageLimit: null,
    perCustomerLimit: 1,
    startsAt: null,
    expiresAt: null,
    createdBy: 'staff-001',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
  },
];

// ─── Admin CRUD ──────────────────────────────────────────

/**
 * List all coupons (admin).
 * 07-api.md §25 — GET /admin/coupons
 */
export async function adminListCoupons(params: {
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: Coupon[]; total: number }> {
  const { status, q, page = 1, pageSize = 20 } = params;

  let filtered = [...mockCoupons];

  if (status) {
    const now = new Date();
    filtered = filtered.filter((c) => {
      if (status === 'active') return c.isActive && (!c.expiresAt || c.expiresAt > now);
      if (status === 'expired') return c.expiresAt && c.expiresAt <= now;
      if (status === 'disabled') return !c.isActive;
      if (status === 'scheduled') return c.startsAt && c.startsAt > now;
      return true;
    });
  }

  if (q) {
    const term = q.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.code.toLowerCase().includes(term) ||
        c.description.toLowerCase().includes(term)
    );
  }

  const total = filtered.length;
  const offset = (page - 1) * pageSize;
  const data = filtered.slice(offset, offset + pageSize);

  return { data, total };
}

/**
 * Get coupon detail (admin).
 * 07-api.md §25 — GET /admin/coupons/:id
 */
export async function adminGetCoupon(couponId: string): Promise<Coupon | null> {
  return mockCoupons.find((c) => c.id === couponId) ?? null;
}

/**
 * Create a new coupon (admin).
 * 07-api.md §25 — POST /admin/coupons
 */
export async function adminCreateCoupon(
  input: {
    code: string;
    description: string;
    discountValue: number;
    scope: CouponScope;
    applicableProductIds?: string[];
    applicableCategoryIds?: string[];
    usageLimit?: number | null;
    perCustomerLimit?: number | null;
    startsAt?: Date | null;
    expiresAt?: Date | null;
  },
  adminId: string,
  adminEmail: string
): Promise<{ data?: Coupon; error?: string }> {
  // Validate code format
  if (!input.code.match(/^[A-Z0-9-]{3,20}$/)) {
    return { error: 'INVALID_CODE_FORMAT' };
  }

  // Check uniqueness
  if (mockCoupons.some((c) => c.code === input.code)) {
    return { error: 'COUPON_CODE_EXISTS' };
  }

  // Validate discount value
  if (input.discountValue <= 0 || input.discountValue > 100) {
    return { error: 'INVALID_DISCOUNT_VALUE' };
  }

  // Validate scope-specific fields
  if (input.scope === 'product' && (!input.applicableProductIds || input.applicableProductIds.length === 0)) {
    return { error: 'PRODUCT_IDS_REQUIRED' };
  }
  if (input.scope === 'category' && (!input.applicableCategoryIds || input.applicableCategoryIds.length === 0)) {
    return { error: 'CATEGORY_IDS_REQUIRED' };
  }

  const now = new Date();
  const coupon: Coupon = {
    id: `coupon_${Date.now()}`,
    code: input.code,
    description: input.description,
    discountType: 'percentage',
    discountValue: input.discountValue,
    scope: input.scope,
    applicableProductIds: input.applicableProductIds ?? [],
    applicableCategoryIds: input.applicableCategoryIds ?? [],
    isActive: true,
    usageCount: 0,
    usageLimit: input.usageLimit ?? null,
    perCustomerLimit: input.perCustomerLimit ?? null,
    startsAt: input.startsAt ?? null,
    expiresAt: input.expiresAt ?? null,
    createdBy: adminId,
    createdAt: now,
    updatedAt: now,
  };

  mockCoupons.push(coupon);

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'coupon_created',
    tableName: 'store.coupons',
    recordId: coupon.id,
    metadata: { code: coupon.code },
  });

  return { data: coupon };
}

/**
 * Update a coupon (admin).
 * 07-api.md §25 — PUT /admin/coupons/:id
 */
export async function adminUpdateCoupon(
  couponId: string,
  input: Partial<{
    description: string;
    discountValue: number;
    scope: CouponScope;
    applicableProductIds: string[];
    applicableCategoryIds: string[];
    usageLimit: number | null;
    perCustomerLimit: number | null;
    startsAt: Date | null;
    expiresAt: Date | null;
  }>,
  adminId: string,
  adminEmail: string
): Promise<{ data?: Coupon; error?: string }> {
  const coupon = mockCoupons.find((c) => c.id === couponId);
  if (!coupon) return { error: 'COUPON_NOT_FOUND' };

  // Cannot change code after creation
  if ('code' in input) return { error: 'CODE_IMMUTABLE' };

  Object.assign(coupon, input, { updatedAt: new Date() });

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'coupon_updated',
    tableName: 'store.coupons',
    recordId: couponId,
    metadata: { code: coupon.code },
  });

  return { data: coupon };
}

/**
 * Toggle coupon active status.
 * 07-api.md §25 — PATCH /admin/coupons/:id/toggle
 */
export async function adminToggleCoupon(
  couponId: string,
  isActive: boolean,
  adminId: string,
  adminEmail: string
): Promise<{ data?: Coupon; error?: string }> {
  const coupon = mockCoupons.find((c) => c.id === couponId);
  if (!coupon) return { error: 'COUPON_NOT_FOUND' };

  coupon.isActive = isActive;
  coupon.updatedAt = new Date();

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: isActive ? 'coupon_enabled' : 'coupon_disabled',
    tableName: 'store.coupons',
    recordId: couponId,
    metadata: { code: coupon.code },
  });

  return { data: coupon };
}

/**
 * Delete a coupon (soft delete).
 * 07-api.md §25 — DELETE /admin/coupons/:id
 */
export async function adminDeleteCoupon(
  couponId: string,
  adminId: string,
  adminEmail: string
): Promise<{ error?: string }> {
  const coupon = mockCoupons.find((c) => c.id === couponId);
  if (!coupon) return { error: 'COUPON_NOT_FOUND' };

  if (coupon.usageCount > 0) {
    return { error: 'COUPON_HAS_USAGES' };
  }

  // Soft delete
  coupon.isActive = false;
  coupon.updatedAt = new Date();

  writeAuditLog({
    actorType: 'admin',
    actorId: adminId,
    actorEmail: adminEmail,
    action: 'coupon_deleted',
    tableName: 'store.coupons',
    recordId: couponId,
    metadata: { code: coupon.code },
  });

  return {};
}

// ─── Customer-Facing Validation ──────────────────────────

/**
 * Validate and apply a coupon code.
 * Returns discount amount based on cart total.
 */
export function validateCoupon(
  code: string,
  cartTotal: number,
  customerId?: string
): CouponValidationResult {
  const coupon = mockCoupons.find(
    (c) => c.code.toUpperCase() === code.toUpperCase()
  );

  if (!coupon) {
    return { valid: false, error: 'COUPON_NOT_FOUND' };
  }

  if (!coupon.isActive) {
    return { valid: false, error: 'COUPON_DISABLED' };
  }

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    return { valid: false, error: 'COUPON_NOT_STARTED' };
  }
  if (coupon.expiresAt && coupon.expiresAt < now) {
    return { valid: false, error: 'COUPON_EXPIRED' };
  }

  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, error: 'COUPON_USAGE_LIMIT_REACHED' };
  }

  // Calculate discount
  const discountAmount = (cartTotal * coupon.discountValue) / 100;

  return {
    valid: true,
    coupon,
    discountAmount: Math.round(discountAmount * 100) / 100,
  };
}

/**
 * Record coupon usage after order completion.
 */
export function recordCouponUsage(couponId: string): void {
  const coupon = mockCoupons.find((c) => c.id === couponId);
  if (coupon) {
    coupon.usageCount++;
  }
}
