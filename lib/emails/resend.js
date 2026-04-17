/**
 * resend.js — thin wrapper around the Resend SDK.
 *
 * Returns null if RESEND_API_KEY is not configured so callers can
 * degrade gracefully (invitation is created in DB; admin copies link manually).
 */

import { Resend } from 'resend';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@dreamware.cl';

/**
 * Send a transactional email via Resend.
 *
 * @param {{ to: string, subject: string, html: string, text: string }} params
 * @returns {Promise<{ id: string }|null>}  null if Resend is not configured or fails
 */
export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('[Resend] RESEND_API_KEY not configured. Email NOT sent to:', to);
    return null;
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      [to],
      subject,
      html,
      text,
    });

    if (error) {
      console.error('[Resend] API error:', error);
      return null;
    }

    return data; // { id: '...' }
  } catch (err) {
    console.error('[Resend] Unexpected error sending email to', to, ':', err);
    return null;
  }
}
