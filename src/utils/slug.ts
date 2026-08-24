/**
 * Generate a URL-safe slug from a product or category name.
 * 03-information-architecture.md §11.3 — lowercase, hyphens, ASCII-only, immutable after creation.
 *
 * @example generateSlug("Steam Wallet ฿100") → "steam-wallet-100"
 * @example generateSlug("ROV Diamond 120") → "rov-diamond-120"
 */
export function generateSlug(input: string): string {
  return (
    input
      .toLowerCase()
      // Remove Thai characters and special chars
      .replace(/[^\w\s-]/g, '')
      // Replace spaces and underscores with hyphens
      .replace(/[\s_]+/g, '-')
      // Collapse multiple hyphens
      .replace(/-+/g, '-')
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, '')
  );
}

/**
 * Check if a string looks like it could be a slug (ASCII lowercase + hyphens + numbers).
 */
export function isSlug(input: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(input);
}
