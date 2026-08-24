/**
 * Loyalty / Store Credit API — 01-prd.md FF-003.
 * Points system: earn on purchase, spend at checkout.
 * Uses mock data for M11 (Prisma in production).
 */

// ─── Types ──────────────────────────────────────────────

export type LoyaltyTransaction = {
  id: string;
  customerId: string;
  type: 'earn' | 'redeem' | 'expire' | 'adjust';
  points: number;
  orderId: string | null;
  description: string;
  expiresAt: Date | null;
  createdAt: Date;
};

export type CustomerLoyaltyBalance = {
  customerId: string;
  totalPoints: number;
  availablePoints: number;
  pendingPoints: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
};

// ─── Constants ──────────────────────────────────────────

const POINTS_PER_BAHT = 1; // 1 point per 1 THB spent
const BAHT_PER_REDEMPTION = 100; // 100 points = 1 THB discount
const POINTS_EXPIRY_MONTHS = 12;

const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 1000,
  gold: 5000,
  platinum: 15000,
};

// ─── Mock Store ──────────────────────────────────────────

const mockTransactions: LoyaltyTransaction[] = [
  {
    id: 'loy-001',
    customerId: 'cust-001',
    type: 'earn',
    points: 214,
    orderId: 'order-001',
    description: 'Earned from order NK-2026-000001',
    expiresAt: new Date('2027-08-20T00:00:00Z'),
    createdAt: new Date('2026-08-20T14:00:21Z'),
  },
  {
    id: 'loy-002',
    customerId: 'cust-001',
    type: 'earn',
    points: 107,
    orderId: 'order-002',
    description: 'Earned from order NK-2026-000002',
    expiresAt: new Date('2027-08-15T00:00:00Z'),
    createdAt: new Date('2026-08-15T10:30:18Z'),
  },
];

// ─── API Functions ───────────────────────────────────────

/**
 * Get customer loyalty balance.
 */
export function getLoyaltyBalance(customerId: string): CustomerLoyaltyBalance {
  const transactions = mockTransactions.filter((t) => t.customerId === customerId);
  const now = new Date();

  let availablePoints = 0;
  let pendingPoints = 0;

  for (const tx of transactions) {
    if (tx.type === 'earn' && tx.expiresAt && tx.expiresAt > now) {
      availablePoints += tx.points;
    } else if (tx.type === 'earn') {
      pendingPoints += tx.points;
    } else if (tx.type === 'redeem') {
      availablePoints -= tx.points;
    }
  }

  availablePoints = Math.max(0, availablePoints);
  const totalPoints = availablePoints + pendingPoints;

  let tier: CustomerLoyaltyBalance['tier'] = 'bronze';
  if (totalPoints >= TIER_THRESHOLDS.platinum) tier = 'platinum';
  else if (totalPoints >= TIER_THRESHOLDS.gold) tier = 'gold';
  else if (totalPoints >= TIER_THRESHOLDS.silver) tier = 'silver';

  return {
    customerId,
    totalPoints,
    availablePoints,
    pendingPoints,
    tier,
  };
}

/**
 * Get customer loyalty transactions.
 */
export function getLoyaltyTransactions(
  customerId: string,
  page: number = 1,
  pageSize: number = 20
): { data: LoyaltyTransaction[]; total: number } {
  const transactions = mockTransactions
    .filter((t) => t.customerId === customerId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = transactions.length;
  const offset = (page - 1) * pageSize;
  const data = transactions.slice(offset, offset + pageSize);

  return { data, total };
}

/**
 * Calculate points to earn for an order.
 */
export function calculatePointsToEarn(orderTotal: number): number {
  return Math.floor(orderTotal * POINTS_PER_BAHT);
}

/**
 * Calculate discount from redeeming points.
 */
export function calculateRedemptionDiscount(points: number): number {
  return Math.floor(points / BAHT_PER_REDEMPTION);
}

/**
 * Record points earned from an order.
 */
export function recordPointsEarned(
  customerId: string,
  orderId: string,
  orderTotal: number
): LoyaltyTransaction {
  const points = calculatePointsToEarn(orderTotal);
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + POINTS_EXPIRY_MONTHS);

  const transaction: LoyaltyTransaction = {
    id: `loy_${Date.now()}`,
    customerId,
    type: 'earn',
    points,
    orderId,
    description: `Earned from order ${orderId}`,
    expiresAt,
    createdAt: new Date(),
  };

  mockTransactions.push(transaction);
  return transaction;
}

/**
 * Record points redeemed at checkout.
 */
export function recordPointsRedeemed(
  customerId: string,
  points: number,
  orderId: string
): LoyaltyTransaction | { error: string } {
  const balance = getLoyaltyBalance(customerId);
  if (balance.availablePoints < points) {
    return { error: 'INSUFFICIENT_POINTS' };
  }

  const transaction: LoyaltyTransaction = {
    id: `loy_${Date.now()}`,
    customerId,
    type: 'redeem',
    points,
    orderId,
    description: `Redeemed ${points} points for order ${orderId}`,
    expiresAt: null,
    createdAt: new Date(),
  };

  mockTransactions.push(transaction);
  return transaction;
}
