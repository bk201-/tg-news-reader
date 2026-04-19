/**
 * Re-exports all Zod schemas from the shared module and provides
 * the server-only parseOptionalBody helper (depends on Hono Context).
 */

import { z } from 'zod';
import type { Context } from 'hono';

// Re-export every schema so existing server route imports stay unchanged
export {
  createChannelSchema,
  updateChannelSchema,
  reorderItemsSchema,
  fetchChannelSchema,
  readAllNewsSchema,
  markReadSchema,
  createGroupSchema,
  updateGroupSchema,
  verifyPinSchema,
  createFilterSchema,
  updateFilterSchema,
  batchFiltersSchema,
  createDownloadSchema,
  createDigestSchema,
  clientLogSchema,
  loginSchema,
  totpConfirmSchema,
} from '../../shared/schemas.js';

/**
 * Safely parse a JSON body and validate with Zod.
 * Returns the default value if the body is empty or malformed.
 * Throws a Zod error if the body is present but fails validation.
 */
export async function parseOptionalBody<T>(c: Context, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const raw: unknown = await c.req.json().catch(() => null);
  if (raw === null || raw === undefined) return fallback;
  return schema.parse(raw);
}
