import { createAdminClient } from '@/lib/supabase/admin';
import AdminSettingsClient from '../AdminSettingsClient';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const admin = createAdminClient();

  const { data: settings } = await admin.from('platform_settings').select('*');
  const settingsMap = Object.fromEntries((settings || []).map(s => [s.key, s.value]));

  return <AdminSettingsClient settings={settingsMap} />;
}
