import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Converts a free-form string to a valid workspace slug.
 * Pattern: ^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$  (3–50 chars)
 *
 * @param {string} input - raw name, e.g. "Verant & Co." or "Mi Empresa"
 * @returns {string} slug candidate, e.g. "verant-co"
 */
export function slugify(input) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/[^a-z0-9]+/g, '-')     // non-alphanumeric → dash
    .replace(/^-+|-+$/g, '')          // trim leading/trailing dashes
    .slice(0, 50)                      // max 50 chars
    .replace(/-+$/g, '');             // trim trailing dash after slice
}

/**
 * Generates a slug from `name` and ensures uniqueness by appending a numeric
 * suffix if the slug is already taken. Uses the admin client to bypass RLS.
 *
 * @param {string} name - workspace name
 * @param {string} [excludeId] - workspace ID to exclude (for updates)
 * @returns {Promise<string>} a unique slug
 */
export async function generateUniqueSlug(name, excludeId = null) {
  const admin = createAdminClient();
  const base  = slugify(name) || 'workspace';

  // Ensure base slug meets minimum length (3 chars)
  const padded = base.length < 3 ? base.padEnd(3, '0') : base;

  let candidate = padded;
  let suffix    = 1;

  for (;;) {
    let query = admin
      .from('workspaces')
      .select('id')
      .eq('slug', candidate);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data } = await query.maybeSingle();

    if (!data) return candidate;  // slug is free

    // Try next suffix
    candidate = `${padded}-${suffix}`;
    suffix += 1;
  }
}
