/**
 * Split the storefront category tree into what the homepage app grid renders.
 *
 * The bug this exists to prevent: the homepage used to do
 * `categories.flatMap((root) => (root.children.length > 0 ? root.children : [root]))`.
 * That flattened the configured hierarchy away and threw the main groups out
 * entirely — staff could create a main group (แอปดูหนัง/ซีรีส์) with children
 * (weTV, Bilibili…) in ตั้งค่า → หมวดหมู่ and it would never reach a customer,
 * because the only place the tree was consumed discarded it.
 *
 * Extracted as a pure function so the rule is directly testable; it lives in
 * its own module with no Prisma import so tests do not need a database mock.
 */

export interface AppGroupNode {
  id: string;
  name: string;
  slug: string;
  icon?: string | null | undefined;
  /** Aggregate product count, when the caller supplied one. */
  productCount?: number | undefined;
  imageUrl?: string | null | undefined;
  productSlug?: string | null | undefined;
  children: AppGroupNode[];
}

export interface AppGroupSplit {
  /** Roots that have children — each renders as a labelled row. */
  groups: AppGroupNode[];
  /** Roots with no children — still rendered, so a flat catalogue works. */
  looseApps: AppGroupNode[];
}

/**
 * A root with at least one child is a main group and is rendered with its
 * heading. A root with none is a standalone tile. Every root lands in exactly
 * one bucket, and ordering follows the caller's (sortOrder), because the two
 * buckets render in sequence.
 */
export function splitAppGroups(categories: readonly AppGroupNode[]): AppGroupSplit {
  const groups: AppGroupNode[] = [];
  const looseApps: AppGroupNode[] = [];
  for (const category of categories) {
    const bucket = category.children.length > 0 ? groups : looseApps;
    bucket.push(category);
  }
  return { groups, looseApps };
}