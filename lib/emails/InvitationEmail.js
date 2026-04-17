/**
 * InvitationEmail — HTML email template para invitaciones a un workspace.
 *
 * Diseño: fondo oscuro (#0e0e0e), tipografía Space Grotesk con fallback a
 * system-ui, logo DreamWare, botón CTA amarillo neón (#d9ff00), texto claro.
 *
 * @param {{
 *   recipientEmail: string,
 *   workspaceName:  string,
 *   role:           string,
 *   inviterName?:   string,
 *   inviteLink:     string,
 * }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildInvitationEmail({
  recipientEmail,
  workspaceName,
  role,
  inviterName,
  inviteLink,
}) {
  const roleLabel = {
    owner:     'propietario',
    admin:     'administrador',
    editor:    'editor',
    commenter: 'comentarista',
    viewer:    'espectador',
  }[role] ?? role;

  const inviterFragment = inviterName
    ? `<strong style="color:#ffffff;">${escapeHtml(inviterName)}</strong> te invitó`
    : 'Te invitaron';

  const subject = `Fuiste invitado a colaborar en ${workspaceName}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0e0e0e;
      color: #d4d4d8;
      font-family: 'Space Grotesk', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      -webkit-font-smoothing: antialiased;
    }
  </style>
</head>
<body style="background-color:#0e0e0e; padding: 40px 16px;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:560px; width:100%; background:#141414; border-radius:16px; border:1px solid #27272a; overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px; border-bottom: 1px solid #27272a;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <!-- DreamWare wordmark -->
                    <span style="font-family:'Space Grotesk',system-ui,sans-serif; font-size:20px; font-weight:700; color:#ffffff; letter-spacing:-0.5px;">
                      Dream<span style="color:#d9ff00;">ware</span>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 40px 32px;">

              <!-- Headline -->
              <h1 style="font-size:24px; font-weight:700; color:#ffffff; line-height:1.3; margin-bottom:12px;">
                Tienes una invitación 🎉
              </h1>

              <!-- Description -->
              <p style="font-size:15px; line-height:1.6; color:#a1a1aa; margin-bottom:8px;">
                ${inviterFragment} a colaborar en el workspace
                <strong style="color:#ffffff;">${escapeHtml(workspaceName)}</strong>
                como <strong style="color:#d9ff00;">${roleLabel}</strong>.
              </p>
              <p style="font-size:14px; color:#71717a; margin-bottom:32px;">
                Acepta la invitación para empezar a trabajar con el equipo.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="border-radius:10px; background:#d9ff00;">
                    <a href="${inviteLink}"
                       target="_blank"
                       style="display:inline-block; padding:14px 28px; font-family:'Space Grotesk',system-ui,sans-serif; font-size:15px; font-weight:700; color:#0e0e0e; text-decoration:none; border-radius:10px; letter-spacing:-0.2px;">
                      Aceptar invitación →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="font-size:12px; color:#52525b; margin-top:20px; line-height:1.6;">
                Si el botón no funciona, copia este link en tu navegador:<br/>
                <a href="${inviteLink}" style="color:#a1a1aa; word-break:break-all;">${inviteLink}</a>
              </p>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="border-top: 1px solid #27272a; padding: 20px 40px;">
              <p style="font-size:12px; color:#3f3f46; line-height:1.5;">
                Este link caduca en 7 días. Si no esperabas esta invitación, puedes ignorar este correo.
                <br/>El link solo funciona para ${escapeHtml(recipientEmail)}.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 40px 28px;">
              <p style="font-size:12px; color:#3f3f46;">
                © ${new Date().getFullYear()} DreamWare · <a href="https://lab.dreamware.studio" style="color:#52525b; text-decoration:none;">lab.dreamware.studio</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Tienes una invitación a DreamWare

${inviterName ? `${inviterName} te invitó` : 'Te invitaron'} a colaborar en el workspace "${workspaceName}" como ${roleLabel}.

Acepta la invitación aquí:
${inviteLink}

Este link caduca en 7 días y solo funciona para ${recipientEmail}.

© ${new Date().getFullYear()} DreamWare`;

  return { subject, html, text };
}

/** Minimal HTML escaping to prevent injection in email templates. */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
