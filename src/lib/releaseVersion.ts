/**
 * The release version the artifact was stamped with (`.next/VERSION`).
 *
 * ONE reader so /api/v1/version and /api/v1/health cannot disagree about what
 * is live — health used to answer `process.env['npm_package_version'] ?? '0.1.0'`,
 * and Passenger runs server.js directly, so that env var never exists in
 * production: health reported a frozen "0.1.0" while the version endpoint
 * reported the real release.
 *
 * Strict MAJOR.MINOR.PATCH or null: a missing file, "1.1", "v1.1.0" or an HTML
 * error page must degrade to "not stamped" rather than name a release nobody
 * chose (same rule stamp-git-sha.mjs applies at build time).
 */
import { readFile } from 'fs/promises';
import path from 'path';

const VERSION_RE = /^\d+\.\d+\.\d+$/;

export async function readReleaseVersion(): Promise<string | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), '.next', 'VERSION'), 'utf8');
    const trimmed = raw.trim();
    return VERSION_RE.test(trimmed) ? trimmed : null;
  } catch {
    return null;
  }
}
