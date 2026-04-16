import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import NewClientForm from './NewClientForm';

export const dynamic = 'force-dynamic';

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/');
}

export default async function NewClientPage() {
  await assertAdmin();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <a href="/admin/clients" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
          ← Volver a Clientes
        </a>
        <h1 className="text-xl font-bold text-white mt-2">Nuevo cliente</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Crea un workspace y onboarda al contacto principal.
        </p>
      </div>

      <NewClientForm />
    </div>
  );
}
