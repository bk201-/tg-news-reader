/**
 * Media file cleanup helpers — shared between routes and services.
 */

import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

function deleteMediaFile(localMediaPath: string | null) {
  if (!localMediaPath) return;
  const filepath = join(process.cwd(), 'data', localMediaPath);
  if (existsSync(filepath)) {
    try {
      unlinkSync(filepath);
    } catch {
      /* ignore */
    }
  }
}

/** Delete all media files for a news row (handles both single and album). */
export function deleteAllMediaFiles(localMediaPath: string | null, localMediaPaths: string[] | null) {
  if (localMediaPaths) {
    localMediaPaths.forEach(deleteMediaFile);
  } else if (localMediaPath) {
    deleteMediaFile(localMediaPath);
  }
}
