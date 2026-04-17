/**
 * WelcomeEmail — HTML email template para usuarios existentes que son
 * agregados directamente a un workspace (ya tienen cuenta en DreamWare).
 *
 * No requieren crear cuenta — el link va directo al workspace.
 *
 * @param {{
 *   recipientName?:  string,
 *   recipientEmail:  string,
 *   workspaceName:   string,
 *   workspaceSlug:   string,
 *   role?:           string,
 *   inviterName?:    string,
 * }} params
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildWelcomeEmail({
  recipientName,
  recipientEmail,
  workspaceName,
  workspaceSlug,
  role,
  inviterName,
}) {
  const workspaceLink = `https://lab.dreamware.studio/w/${workspaceSlug}`;

  const greeting = recipientName
    ? `Hola, ${escapeHtml(recipientName.split(' ')[0])} 👋`
    : 'Hola 👋';

  const inviterFragment = inviterName
    ? `<strong style="color:#ffffff;">${escapeHtml(inviterName)}</strong> te agregó`
    : 'Te agregaron';

  const roleLabel = role ? ({
    owner:     'propietario',
    admin:     'administrador',
    editor:    'editor',
    commenter: 'comentarista',
    viewer:    'espectador',
  }[role] ?? role) : null;

  const subject = `Ahora eres parte de ${workspaceName} en DreamWare`;

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

              <h1 style="font-size:24px; font-weight:700; color:#ffffff; line-height:1.3; margin-bottom:12px;">
                ${greeting}
              </h1>

              <p style="font-size:15px; line-height:1.6; color:#a1a1aa; margin-bottom:8px;">
                ${inviterFragment} al workspace
                <strong style="color:#ffffff;">${escapeHtml(workspaceName)}</strong>
                en DreamWare${roleLabel ? ` como <strong style="color:#d9ff00;">${roleLabel}</strong>` : ''}.
              </p>
              <p style="font-size:14px; color:#71717a; margin-bottom:32px;">
                Ya podés acceder directamente — no necesitás crear una cuenta nueva.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="border-radius:10px; background:#d9ff00;">
                    <a href="${workspaceLink}"
                       target="_blank"
                       style="display:inline-block; padding:14px 28px; font-family:'Space Grotesk',system-ui,sans-serif; font-size:15px; font-weight:700; color:#0e0e0e; text-decoration:none; border-radius:10px; letter-spacing:-0.2px;">
                      Ir al workspace →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <p style="font-size:12px; color:#52525b; margin-top:20px; line-height:1.6;">
                También podés entrar copiando este link:<br/>
                <a href="${workspaceLink}" style="color:#a1a1aa; word-break:break-all;">${workspaceLink}</a>
              </p>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="border-top: 1px solid #27272a; padding: 20px 40px;">
              <p style="font-size:12px; color:#3f3f46; line-height:1.5;">
                Este mensaje fue enviado a ${escapeHtml(recipientEmail)}.
                Si no esperabas este acceso, contacta a tu equipo.
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

  const text = `${recipientName ? `Hola, ${recipientName.split(' ')[0]}` : 'Hola'}

${inviterName ? `${inviterName} te agregó` : 'Te agregaron'} al workspace "${workspaceName}" en DreamWare${roleLabel ? ` como ${roleLabel}` : ''}.

Entrá aquí:
${workspaceLink}

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
