/**
 * Admin entry point — `/management` (and `/management/`, which Next
 * normalises here) must never answer 404. The spec calls this URL the admin
 * door: 02-user-flow "Entry: /management/ → redirect to /management/login/",
 * 03-IA "/management/ … Admin Dashboard (authenticated)".
 *
 * There is deliberately no dashboard markup here. `/management/login` is the
 * single gate: it checks `/api/v1/auth/admin/me` and sends a live session
 * straight to the dashboard, otherwise it shows the form. Duplicating that
 * decision here would give auth two owners, and a redirect-only page cannot
 * render admin chrome to a signed-out visitor even for a frame.
 *
 * The client layout (`app/management/layout.tsx`) still guards every other
 * sub-route; this page only fixes the door.
 */
import { redirect } from 'next/navigation';

export default function ManagementEntryPage(): never {
  redirect('/management/login');
}
