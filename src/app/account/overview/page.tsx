/**
 * /account/overview — merged into /account/dashboard (โปรไฟล์ของฉัน) when the
 * store tabs were removed from the profile. Kept as a permanent redirect so
 * old links (and the wallet page's ดูทั้งหมด backlinks) keep working.
 */

import { redirect } from 'next/navigation';

export default function AccountOverviewPage(): never {
  redirect('/account/dashboard');
}
