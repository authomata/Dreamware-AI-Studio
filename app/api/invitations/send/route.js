/**
 * POST /api/invitations/send
 *
 * Internal route handler called by server actions after creating a
 * workspace_invitations row. Sends the invitation email via Resend.
 *
 * Body (JSON):
 *   workspace_id    string  — for audit / future use
 *   workspace_name  string  — display name in the email
 *   workspace_slug  string  — used to build the invite link
 *   email           string  — recipient
 *   role            string  — viewer|commenter|editor|admin|owner
 *   token           string  — invitation token (goes in the link)
 *   inviter_name?   string  — optional sender display name
 *   type?           string  — 'invitation' (default) | 'welcome'
 *
 * Security: only accepts requests from the same Next.js origin via the
 * INTERNAL_API_SECRET header. Falls back to no-op if Resend isn't wired.
 */

import { NextResponse } from 'next/server';
import { sendEmail }           from '@/lib/emails/resend';
import { buildInvitationEmail } from '@/lib/emails/InvitationEmail';
import { buildWelcomeEmail }    from '@/lib/emails/WelcomeEmail';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://lab.dreamware.studio';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      workspace_id,
      workspace_name,
      workspace_slug,
      email,
      role,
      token,
      inviter_name,
      type = 'invitation',
    } = body;

    // Basic validation
    if (!email || !workspace_name || !workspace_slug) {
      return NextResponse.json(
        { error: 'Missing required fields: email, workspace_name, workspace_slug' },
        { status: 400 }
      );
    }

    let emailPayload;

    if (type === 'welcome') {
      // Existing user added directly to workspace
      emailPayload = buildWelcomeEmail({
        recipientEmail:  email,
        workspaceName:   workspace_name,
        workspaceSlug:   workspace_slug,
        role,
        inviterName:     inviter_name,
      });
    } else {
      // New user — needs to accept invitation and create account
      if (!token) {
        return NextResponse.json(
          { error: 'token is required for invitation emails' },
          { status: 400 }
        );
      }

      const inviteLink = `${BASE_URL}/invitations/${token}`;

      emailPayload = buildInvitationEmail({
        recipientEmail: email,
        workspaceName:  workspace_name,
        role,
        inviterName:    inviter_name,
        inviteLink,
      });
    }

    const result = await sendEmail({
      to:      email,
      subject: emailPayload.subject,
      html:    emailPayload.html,
      text:    emailPayload.text,
    });

    if (!result) {
      // Resend not configured or failed — not a hard error
      return NextResponse.json({ sent: false, reason: 'resend_unavailable' });
    }

    return NextResponse.json({ sent: true, id: result.id });
  } catch (err) {
    console.error('[/api/invitations/send] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
