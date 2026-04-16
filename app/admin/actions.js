'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Forbidden');
}

export async function setUserRole(userId, role) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.from('profiles').update({ role }).eq('id', userId);
  revalidatePath('/admin');
}

export async function setUserCreditLimit(userId, limit) {
  await assertAdmin();
  const admin = createAdminClient();
  const value = limit === '' || limit === null ? null : parseInt(limit);
  await admin.from('profiles').update({ credit_limit: value }).eq('id', userId);
  revalidatePath('/admin');
}

export async function banUser(userId) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: '876600h' }); // ~100 years
  revalidatePath('/admin');
}

export async function unbanUser(userId) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  revalidatePath('/admin');
}

export async function deleteUser(userId) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
  revalidatePath('/admin');
}

export async function savePlatformSetting(key, value) {
  await assertAdmin();
  const admin = createAdminClient();
  await admin.from('platform_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  revalidatePath('/admin');
}

export async function getPlatformSetting(key) {
  await assertAdmin();
  const admin = createAdminClient();
  const { data } = await admin.from('platform_settings').select('value').eq('key', key).single();
  return data?.value ?? null;
}
