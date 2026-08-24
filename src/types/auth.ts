/**
 * Auth Types — RBAC permission registry.
 * 08-auth.md §7.1-7.3 — 6 roles, 35+ permissions.
 *
 * `as const` union per 18-coding.md §3.4 — enum keyword is banned project-wide.
 * Values match store.admin_role exactly (06-database.md §4).
 */

// ─── Admin Roles ──────────────────────────────────────────

export const AdminRole = {
  SUPER_ADMIN: 'super_admin',
  CATALOGUE_MANAGER: 'catalogue_manager',
  ORDER_MANAGER: 'order_manager',
  FINANCE_VIEWER: 'finance_viewer',
  SUPPORT_AGENT: 'support_agent',
  MARKETING_MANAGER: 'marketing_manager',
} as const;

export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

// ─── Permissions ──────────────────────────────────────────

export const ALL_PERMISSIONS = [
  // Products
  'products:read',
  'products:write',
  'products:publish',
  'products:delete',

  // Categories
  'categories:read',
  'categories:write',

  // Inventory
  'inventory:read',
  'inventory:upload',
  'inventory:void',
  'inventory:export',
  'inventory:reveal',

  // Orders
  'orders:read',
  'orders:read:full',
  'orders:write',
  'orders:refund',
  'orders:export',

  // Customers
  'customers:read',
  'customers:read:full',
  'customers:block',

  // Reviews
  'reviews:read',
  'reviews:moderate',

  // Coupons
  'coupons:read',
  'coupons:write',
  'coupons:delete',

  // Reports
  'reports:read',
  'reports:export',

  // Staff
  'staff:read',
  'staff:write',
  'staff:deactivate',
  'staff:reset-2fa',

  // Audit
  'audit:read',
  'audit:export',

  // Settings
  'settings:read',
  'settings:write',

  // PDPA
  'pdpa:read',
  'pdpa:action',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

// ─── Role → Permission Matrix ─────────────────────────────

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: ALL_PERMISSIONS as unknown as Permission[],

  catalogue_manager: [
    'products:read', 'products:write', 'products:publish', 'products:delete',
    'categories:read', 'categories:write',
    'inventory:read', 'inventory:upload', 'inventory:void', 'inventory:export',
    'coupons:read', 'coupons:write',
  ],

  order_manager: [
    'orders:read', 'orders:read:full', 'orders:write', 'orders:refund',
    'customers:read', 'customers:read:full', 'customers:block',
    'reviews:read', 'reviews:moderate',
  ],

  finance_viewer: [
    'orders:read', 'orders:read:full', 'orders:export',
    'reports:read', 'reports:export',
  ],

  support_agent: [
    'orders:read',
    'customers:read',
    'reviews:read',
  ],

  marketing_manager: [
    'products:read', 'categories:read',
    'coupons:read', 'coupons:write',
    'reports:read',
  ],
};

// ─── Admin JWT Payload ────────────────────────────────────

export interface AdminJwtPayload {
  sub: string;        // admin UUID
  email: string;
  role: AdminRole;
  perms: Permission[];
  iat: number;
  exp: number;
  jti: string;        // unique token ID
}

// ─── Route → Permission Map ───────────────────────────────

export const ROUTE_PERMISSIONS: Record<string, Permission[]> = {
  'GET /api/v1/admin/products':              ['products:read'],
  'POST /api/v1/admin/products':             ['products:write'],
  'PUT /api/v1/admin/products/:id':          ['products:write'],
  'PATCH /api/v1/admin/products/:id/status': ['products:publish'],
  'DELETE /api/v1/admin/products/:id':       ['products:delete'],

  'GET /api/v1/admin/categories':            ['categories:read'],
  'POST /api/v1/admin/categories':           ['categories:write'],
  'PUT /api/v1/admin/categories/:id':        ['categories:write'],
  'DELETE /api/v1/admin/categories/:id':     ['categories:write'],

  'GET /api/v1/admin/inventory':                          ['inventory:read'],
  'POST /api/v1/admin/inventory/:id/upload':              ['inventory:upload'],
  'POST /api/v1/admin/inventory/:id/codes':               ['inventory:upload'],
  'PATCH /api/v1/admin/inventory/codes/:id/void':         ['inventory:void'],
  'GET /api/v1/admin/inventory/codes/:id/reveal':         ['inventory:reveal'],

  'GET /api/v1/admin/orders':                  ['orders:read'],
  'GET /api/v1/admin/orders/:id':              ['orders:read'],
  'POST /api/v1/admin/orders/:id/resend-email':['orders:write'],
  'POST /api/v1/admin/orders/:id/assign-code': ['orders:write'],
  'POST /api/v1/admin/orders/:id/refund':      ['orders:refund'],

  'GET /api/v1/admin/customers':              ['customers:read'],
  'GET /api/v1/admin/customers/:id':          ['customers:read'],
  'PATCH /api/v1/admin/customers/:id/block':  ['customers:block'],

  'GET /api/v1/admin/staff':                  ['staff:read'],
  'POST /api/v1/admin/staff':                 ['staff:write'],
  'PATCH /api/v1/admin/staff/:id/role':       ['staff:write'],
  'PATCH /api/v1/admin/staff/:id/deactivate': ['staff:deactivate'],

  'GET /api/v1/admin/dashboard/stats':        ['products:read'],
};

// ─── Admin Account Status ─────────────────────────────────

export const AdminAccountStatus = {
  ACTIVE: 'active',
  DEACTIVATED: 'deactivated',
  LOCKED: 'locked',
} as const;

export type AdminAccountStatus = (typeof AdminAccountStatus)[keyof typeof AdminAccountStatus];
