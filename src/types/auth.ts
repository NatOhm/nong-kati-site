/** Auth types: permission registry and route → permission map. */

export const AdminRole = {
  SUPER_ADMIN: 'super_admin',
  CATALOGUE_MANAGER: 'catalogue_manager',
  ORDER_MANAGER: 'order_manager',
  FINANCE_VIEWER: 'finance_viewer',
  SUPPORT_AGENT: 'support_agent',
  MARKETING_MANAGER: 'marketing_manager',
} as const;

export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

export const ALL_PERMISSIONS = [
  'products:read',
  'products:write',
  'products:publish',
  'products:delete',
  'categories:read',
  'categories:write',
  'inventory:read',
  'inventory:upload',
  'inventory:void',
  'inventory:export',
  'inventory:reveal',
  'orders:read',
  'orders:read:full',
  'orders:write',
  'orders:refund',
  'orders:export',
  'orders:delivery:reveal',
  'customers:read',
  'customers:read:full',
  'customers:block',
  'customers:write',
  'tickets:read',
  'tickets:write',
  'topups:read',
  'reviews:read',
  'reviews:moderate',
  'coupons:read',
  'coupons:write',
  'coupons:delete',
  'promotions:read',
  'promotions:write',
  'promotions:delete',
  'dashboard:read',
  'reports:read',
  'reports:export',
  'staff:read',
  'staff:write',
  'staff:deactivate',
  'staff:reset-2fa',
  'audit:read',
  'audit:export',
  'settings:read',
  'settings:write',
  'pdpa:read',
  'pdpa:action',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
  perms: Permission[];
  iat: number;
  exp: number;
  jti: string;
  passwordChangeRequired?: boolean;
}

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: ALL_PERMISSIONS as unknown as Permission[],
  catalogue_manager: [
    'products:read',
    'products:write',
    'products:publish',
    'products:delete',
    'categories:read',
    'categories:write',
    'inventory:read',
    'inventory:upload',
    'inventory:void',
    'inventory:export',
    'coupons:read',
    'coupons:write',
    'coupons:delete',
    'promotions:read',
    'promotions:write',
    'promotions:delete',
    'dashboard:read',
    'reports:read',
    'reports:export',
    'customers:read',
    'customers:block',
    'customers:write',
  ],
  order_manager: [
    'dashboard:read',
    'orders:read',
    'orders:read:full',
    'orders:write',
    'orders:delivery:reveal',
    'orders:refund',
    'orders:export',
    'customers:read',
    'customers:read:full',
    'customers:block',
    'customers:write',
    'tickets:read',
    'tickets:write',
  ],
  finance_viewer: [
    'orders:read',
    'orders:read:full',
    'orders:export',
    'reports:read',
    'reports:export',
    'dashboard:read',
  ],
  support_agent: [
    'orders:read',
    'orders:delivery:reveal',
    'customers:read',
    'tickets:read',
    'tickets:write',
    'topups:read',
    'reviews:read',
    'dashboard:read',
  ],
  marketing_manager: [
    'products:read',
    'categories:read',
    'coupons:read',
    'coupons:write',
    'coupons:delete',
    'promotions:read',
    'promotions:write',
    'promotions:delete',
    'reports:read',
    'dashboard:read',
  ],
};

/**
 * Route → permission map.
 *
 * Every entry must exist on disk with a matching `export async function
 * <METHOD>`, or sit on the KNOWN_UNBUILT ratchet in
 * tests/admin-stored-accounts.test.ts (delete each ratchet entry as it is
 * built — a NEW gap fails that suite). Keep in sync with ROUTE_COVERAGE in
 * tests/admin-authz-matrix.test.ts.
 */
export const ROUTE_PERMISSIONS: Record<string, Permission[]> = {
  'GET /api/v1/admin/announcement': ['settings:read'],
  'PUT /api/v1/admin/announcement': ['settings:write'],
  'GET /api/v1/admin/audit-log': ['audit:read'],
  'GET /api/v1/admin/categories': ['categories:read'],
  'POST /api/v1/admin/categories': ['categories:write'],
  'GET /api/v1/admin/coupons': ['coupons:read'],
  'POST /api/v1/admin/coupons': ['coupons:write'],
  'GET /api/v1/admin/customers': ['customers:read'],
  'GET /api/v1/admin/customers/:id': ['customers:read'],
  'GET /api/v1/admin/customers/:id/history': ['customers:read'],
  'PATCH /api/v1/admin/customers/:id/block': ['customers:block'],
  // ratchet: KNOWN_UNBUILT (tier picker not built)
  'PATCH /api/v1/admin/customers/:id/tier': ['customers:write'],
  'GET /api/v1/admin/dashboard': ['dashboard:read'],
  // ratchet: KNOWN_UNBUILT (stats endpoint superseded by GET /dashboard)
  'GET /api/v1/admin/dashboard/stats': ['dashboard:read'],
  'GET /api/v1/admin/inventory': ['inventory:read'],
  'POST /api/v1/admin/inventory': ['inventory:upload'],
  // ratchet: KNOWN_UNBUILT (bulk code upload)
  'POST /api/v1/admin/inventory/:id/upload': ['inventory:upload'],
  // ratchet: KNOWN_UNBUILT (per-variant code generation)
  'POST /api/v1/admin/inventory/:id/codes': ['inventory:upload'],
  'GET /api/v1/admin/orders': ['orders:read'],
  'GET /api/v1/admin/orders/:id': ['orders:read'],
  'GET /api/v1/admin/orders/search': ['orders:read'],
  'GET /api/v1/admin/orders/:id/delivery': ['orders:delivery:reveal'],
  'POST /api/v1/admin/orders/:id/assign-code': ['orders:write'],
  'POST /api/v1/admin/orders/:id/refund': ['orders:refund'],
  'POST /api/v1/admin/orders/:id/resend-email': ['orders:write'],
  'POST /api/v1/admin/orders/:id/verify-payment': ['orders:write'],
  'GET /api/v1/admin/products': ['products:read'],
  'POST /api/v1/admin/products': ['products:write'],
  'PUT /api/v1/admin/products/:id': ['products:write'],
  'DELETE /api/v1/admin/products/:id': ['products:write'],
  // ratchet: KNOWN_UNBUILT (status toggle endpoint)
  'PATCH /api/v1/admin/products/:id/status': ['products:write'],
  'GET /api/v1/admin/reports/customer-sales': ['reports:read'],
  'GET /api/v1/admin/reports/customer-sales/export': ['reports:export'],
  'GET /api/v1/admin/settings/vat': ['settings:read'],
  'PUT /api/v1/admin/settings/vat': ['settings:write'],
  'GET /api/v1/admin/staff': ['staff:read'],
  // ratchet: KNOWN_UNBUILT (role change)
  'PATCH /api/v1/admin/staff/:id/role': ['staff:write'],
  // ratchet: KNOWN_UNBUILT (deactivate)
  'PATCH /api/v1/admin/staff/:id/deactivate': ['staff:deactivate'],
  'GET /api/v1/admin/tickets': ['tickets:read'],
  'GET /api/v1/admin/topups': ['topups:read'],
};
