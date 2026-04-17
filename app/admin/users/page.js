import { createAdminClient } from '@/lib/supabase/admin';
import AdminUsersClient from '../AdminUsersClient';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const admin = createAdminClient();

  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const { data: profiles } = await admin.from('profiles').select('*');

  const users = authUsers.map(u => {
    const profile = profiles?.find(p => p.id === u.id) || {};
    return {
      id:               u.id,
      email:            u.email,
      created_at:       u.created_at,
      last_sign_in_at:  u.last_sign_in_at,
      banned:           !!u.banned_until && new Date(u.banned_until) > new Date(),
      role:             profile.role        || 'free',
      muapi_key:        profile.muapi_key   || null,
      credit_limit:     profile.credit_limit ?? null,
      credits_used:     profile.credits_used ?? 0,
    };
  });

  return <AdminUsersClient users={users} />;
}
