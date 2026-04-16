import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import InvitationAcceptClient from './InvitationAcceptClient';

export const dynamic = 'force-dynamic';

export default async function InvitationPage({ params }) {
  const { token } = await params;
  const adminClient = createAdminClient();

  // Fetch invitation by token (admin client bypasses RLS)
  const { data: invitation } = await adminClient
    .from('workspace_invitations')
    .select(`
      id, email, role, expires_at, accepted_at,
      workspace:workspaces (id, name, slug, logo_url, brand_color)
    `)
    .eq('token', token)
    .single();

  // States: not found, expired, already accepted
  if (!invitation) {
    return <InvitationError message="Esta invitación no existe o el enlace es inválido." />;
  }

  if (invitation.accepted_at) {
    return <InvitationError message="Esta invitación ya fue aceptada." />;
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return <InvitationError message="Esta invitación expiró. Pídele al administrador que te envíe una nueva." />;
  }

  // Check if current user is already logged in
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <InvitationAcceptClient
      invitation={invitation}
      token={token}
      currentUserEmail={user?.email ?? null}
    />
  );
}

function InvitationError({ message }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="text-4xl mb-4">🔗</div>
        <h1 className="text-xl font-bold text-white mb-2">Invitación inválida</h1>
        <p className="text-zinc-400">{message}</p>
        <a
          href="/"
          className="inline-block mt-6 text-sm text-yellow-400 hover:underline"
        >
          Ir al inicio
        </a>
      </div>
    </div>
  );
}
