/**
 * Email helper via Resend (PEP-297).
 *
 * File kept as sendgrid.js to avoid renaming imports across the codebase.
 * The export names (SENDGRID_API_KEY, sendEmail) remain unchanged so
 * digest/index.js doesn't need updates.
 */
import { Resend } from "resend";
import { defineSecret } from "firebase-functions/params";

export const SENDGRID_API_KEY = defineSecret("RESEND_API_KEY");

/**
 * Send an HTML email via Resend.
 *
 * @param {Object} opts
 * @param {string} opts.to       - Recipient email
 * @param {string} opts.subject  - Email subject line
 * @param {string} opts.html     - HTML body
 * @param {string} [opts.from]   - Sender email (default: onboarding@resend.dev — temporary until domain verified)
 */
export async function sendEmail({ to, subject, html, from }) {
  const key = process.env.RESEND_API_KEY ||
    SENDGRID_API_KEY.value() || null;
  if (!key) throw new Error("RESEND_API_KEY not configured");

  const resend = new Resend(key);
  await resend.emails.send({
    to,
    from: from || "onboarding@resend.dev",
    subject,
    html,
  });
}
