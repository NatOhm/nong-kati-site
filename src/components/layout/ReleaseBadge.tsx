'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';

/**
 * Payload of the public GET /api/v1/version endpoint (always `no-store`).
 *
 * `buildId` is the source of truth — Next.js writes .next/BUILD_ID and the
 * deploy artifact ships it — so it cannot drift from what is actually
 * serving requests the way an env var echo can. `gitSha` carries `-dirty`
 * when the bundle was made from an uncommitted tree, and `gitRef`/`gitSha`
 * degrade to the literal 'unknown' rather than to a guess.
 */
export interface ReleaseInfo {
  buildId: string | null;
  /**
   * The human-facing release number (client ask, 2026-10-29): the commit
   * count stamped into `.next/BUILD_NUMBER` at build time. Shown in place of
   * the raw build id because an operator can read "337" aloud; `buildId`
   * stays on the payload (and as the fallback below) because it is still the
   * source of truth for WHICH bundle is serving requests.
   * null until a stamped build ships the file — the UI then degrades to the
   * raw id rather than to nothing.
   */
  buildNumber: number | null;
  gitSha: string;
  gitRef: string;
}

export interface ReleaseState {
  release: ReleaseInfo | null;
  /** Epoch ms of the successful fetch — printed on the dashboard card. */
  fetchedAt: number | null;
  /** The request itself failed (NOT "the endpoint answered unknown"). */
  failed: boolean;
}

/**
 * One Thai sentence for the un-committed-build warning, shared by the chip
 * tooltip and the dashboard card so the two readings can never diverge.
 */
export const DIRTY_WARNING_TEXT =
  'เวอร์ชันนี้สร้างจากไฟล์ที่ยังไม่ได้ commit — แก้ไขไม่ได้จาก commit นี้';

/**
 * One request per browser session, shared by all mounts.
 *
 * There are three readings of the same number (top bar, sidebar footer,
 * dashboard card) and the shell remounts on every admin navigation, so a
 * naive `useEffect(fetch)` per mount would fan out into a request per page
 * for an answer that cannot change while the tab lives — the build id only
 * moves when the server process is replaced. The module-scoped promise makes
 * every mount await the first request; a rejection clears it so the NEXT
 * mount retries instead of caching the failure for the whole session.
 */
let pending: Promise<ReleaseInfo> | null = null;
let settled: { value: ReleaseInfo; at: number } | null = null;

function loadRelease(): Promise<ReleaseInfo> {
  if (settled) return Promise.resolve(settled.value);
  if (!pending) {
    pending = fetch('/api/v1/version', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as Partial<ReleaseInfo>;
        // 'unknown' / null is a REAL answer (the route degrades deliberately)
        // and is handled below as "nothing verifiable" — never as a failure.
        const value: ReleaseInfo = {
          buildId: body.buildId ?? null,
          // Shape-checked like the server side: anything that is not a
          // positive integer is treated as "not stamped".
          buildNumber:
            typeof body.buildNumber === 'number' &&
            Number.isInteger(body.buildNumber) &&
            body.buildNumber > 0
              ? body.buildNumber
              : null,
          gitSha: body.gitSha ?? 'unknown',
          gitRef: body.gitRef ?? 'unknown',
        };
        settled = { value, at: Date.now() };
        return value;
      })
      .catch((err: unknown) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

/**
 * Client-side access to the cached release identity.
 *
 * Reads the cache during the initial state so a mount that follows an
 * earlier one paints the right build immediately, with no flash of an empty
 * badge on every navigation.
 */
export function useRelease(): ReleaseState {
  const [state, setState] = useState<ReleaseState>(() => ({
    release: settled?.value ?? null,
    fetchedAt: settled?.at ?? null,
    failed: false,
  }));

  useEffect(() => {
    if (state.release) return; // already painted from the shared cache
    let cancelled = false;
    void loadRelease()
      .then((value) => {
        if (!cancelled) {
          setState({ release: value, fetchedAt: settled?.at ?? null, failed: false });
        }
      })
      .catch(() => {
        // Degrade to an explicit "failed" — never a broken layout. The badge
        // renders nothing; the dashboard card keeps its failure line.
        if (!cancelled) setState((prev) => ({ ...prev, failed: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [state.release]);

  return state;
}

export interface DerivedRelease {
  /** The bundle came from an uncommitted tree (`<sha>-dirty`). */
  dirty: boolean;
  /** First 7 chars of the sha, `-dirty` stripped. */
  shortSha: string;
  shaKnown: boolean;
  /** First 8 chars of the build id, or null when not stamped. */
  shortBuild: string | null;
  /**
   * What the chip actually renders as the build token: `#337` when the
   * number is stamped, otherwise the short raw build id. One field so no
   * placement can show the number while another still shows the id.
   */
  displayBuild: string | null;
  refKnown: boolean;
  /** Nothing verifiable to show — the badge then stays out of the way. */
  usable: boolean;
}

export function deriveRelease(release: ReleaseInfo): DerivedRelease {
  const dirty = release.gitSha.endsWith('-dirty');
  const shortSha = release.gitSha.replace(/-dirty$/, '').slice(0, 7);
  const shaKnown = /^[0-9a-f]{7}$/i.test(shortSha);
  const shortBuild = release.buildId ? release.buildId.slice(0, 8) : null;
  const displayBuild =
    release.buildNumber !== null ? `#${release.buildNumber}` : shortBuild;
  const refKnown = Boolean(release.gitRef) && release.gitRef !== 'unknown';
  return {
    dirty,
    shortSha,
    shaKnown,
    shortBuild,
    displayBuild,
    refKnown,
    usable: Boolean(displayBuild) || shaKnown,
  };
}

/** Full identity string — the tooltip, the screen-reader name and the copy payload. */
function fullLabel(release: ReleaseInfo, d: DerivedRelease): string {
  const parts = [
    d.displayBuild ? `build ${d.displayBuild}` : 'ไม่มี build id',
    d.shaKnown ? `commit ${release.gitSha}` : 'ไม่มี commit',
  ];
  if (d.refKnown) parts.push(`ref ${release.gitRef}`);
  return d.dirty ? `${parts.join(' · ')} — ${DIRTY_WARNING_TEXT}` : parts.join(' · ');
}

/** How much of the commit hash a chip carries. */
type CommitMode = 'always' | 'responsive' | 'none';

export interface ReleaseBadgeProps {
  /**
   * `chip`  — compact monospace pill for the top bar and the sidebar.
   * `full`  — labelled build id + full commit + ref, for the dashboard card.
   */
  variant?: 'chip' | 'full';
  /**
   * Chip only. `responsive` drops the commit half below the `sm` breakpoint
   * (the 390px top bar also holds the bell and logout); `none` is the
   * collapsed 4rem rail, which has no width for it at all.
   */
  commit?: CommitMode;
  /**
   * Chip only: the collapsed rail. Shows the bare short build id — no
   * `build ` prefix, no commit — centred by the caller and truncated rather
   * than allowed to overflow the 4rem column.
   */
  minimal?: boolean;
  className?: string;
}

/**
 * The release identity, rendered.
 *
 * Degrades invisibly: while loading, when the endpoint has no verifiable
 * identity, or when the request failed, this returns null — an empty line
 * beats a flicker or a broken header. The dashboard card owns the explicit
 * failure text.
 */
export function ReleaseBadge({
  variant = 'chip',
  commit = 'always',
  minimal = false,
  className,
}: ReleaseBadgeProps): React.JSX.Element | null {
  const { release } = useRelease();
  if (!release) return null;

  const d = deriveRelease(release);
  if (!d.usable) return null;

  const label = fullLabel(release, d);

  if (variant === 'full') {
    return (
      <span
        className={cn(
          'inline-flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs',
          d.dirty ? 'text-fg-error' : 'text-fg',
          className,
        )}
      >
        {d.displayBuild && <span>build {d.displayBuild}</span>}
        {d.shaKnown && <span>commit {release.gitSha}</span>}
        {d.refKnown && <span>ref {release.gitRef}</span>}
      </span>
    );
  }

  return (
    <span
      title={label}
      className={cn(
        // Error tokens only for a dirty build (the state .verify-bundle.ps1
        // refuses to ship) — otherwise a quiet surface chip.
        'inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border px-2 py-1 font-mono text-[11px] leading-none',
        d.dirty ? 'border-error bg-error text-fg-error' : 'border-line-subtle bg-surface text-fg-muted',
        className,
      )}
    >
      {/* Complete name for assistive tech; the visible short form is decorative. */}
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="flex min-w-0 items-center gap-1">
        {minimal ? (
          // 4rem rail: six chars + this chip's own border still clear the
          // column (a full 8 does not), truncate covers an odd font metric.
          <span className="min-w-0 truncate">{(d.displayBuild ?? d.shortSha).slice(0, 6)}</span>
        ) : (
          <>
            {d.displayBuild && (
              <>
                <span className="hidden min-w-0 truncate sm:block">build {d.displayBuild}</span>
                {/* Below sm the prefix is what has to go — `#337` still fits. */}
                <span className="min-w-0 truncate sm:hidden">{d.displayBuild}</span>
              </>
            )}
            {commit !== 'none' && d.shaKnown && (
              <span
                className={cn('min-w-0 truncate', commit === 'responsive' && 'hidden sm:block')}
              >
                {d.displayBuild ? '· ' : ''}commit {d.shortSha}
              </span>
            )}
          </>
        )}
      </span>
    </span>
  );
}
