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
  children: readonly AppGroupNode[];
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
    const childrenOrEmpty = category.children ?? [];
    const bucket = childrenOrEmpty.length > 0 ? groups : looseApps;
    bucket.push(category);
  }
  return { groups, looseApps };
}

/** A category is shoppable only when at least one active product sits in it. */
export function hasProducts(node: AppGroupNode): boolean {
  return (node.productCount ?? 0) > 0;
}

/**
 * Hide the empties instead of rendering a tile that leads to "no products".
 * A group keeps only its product-bearing children and disappears entirely
 * when none are left, so an unconfigured catalogue no longer shows eight
 * identical empty rows. Ordering follows the caller's sortOrder.
 */
export function filterEmptyAppGroups(split: AppGroupSplit): AppGroupSplit {
  const groups = split.groups
    .map((group) => ({ ...group, children: group.children.filter(hasProducts) }))
    .filter((group) => group.children.length > 0 && hasProducts(group));
  return { groups, looseApps: split.looseApps.filter(hasProducts) };
}

/**
 * The bento's wide tile: the group with the most products. First one wins a
 * tie, so the layout is stable between requests (the list is already sorted
 * by sortOrder). Returns null for an empty catalogue.
 */
export function featureAppGroupId(groups: readonly AppGroupNode[]): string | null {
  let best: AppGroupNode | null = null;
  for (const group of groups) {
    if (!hasProducts(group)) continue;
    if (best === null || (group.productCount ?? 0) > (best.productCount ?? 0)) best = group;
  }
  return best?.id ?? null;
}