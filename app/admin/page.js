import { createAdminClient } from '@/lib/supabase/admin';
import AdminClient from './AdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const admin = createAdminClient();

  // Fetch all auth users
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });

  // Fetch all profiles
  const { data: profiles } = await admin.from('profiles').select('*');

  // Fetch platform settings
  const { data: settings } = await admin.from('platform_settings').select('*');

  const settingsMap = Object.fromEntries((settings || []).map(s => [s.key, s.value]));

  // Merge auth users with profiles
  const users = authUsers.map(u => {
    const profile = profiles?.find(p => p.id === u.id) || {};
    return {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      banned: !!u.banned_until && new Date(u.banned_until) > new Date(),
      role: profile.role || 'free',
      muapi_key: profile.muapi_key || null,
      credit_limit: profile.credit_limit ?? null,
      credits_used: profile.credits_used ?? 0,
    };
  });

  return <AdminClient users={users} settings={settingsMap} />;
}
