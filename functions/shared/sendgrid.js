/**
 * SendGrid email helper (PEP-297).
 */
import sgMail from "@sendgrid/mail";
import { defineSecret } from "firebase-functions/params";

export const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

/**
 * Send an HTML email via SendGrid.
 *
 * @param {Object} opts
 * @param {string} opts.to       - Recipient email
 * @param {string} opts.subject  - Email subject line
 * @param {string} opts.html     - HTML body
 * @param {string} [opts.from]   - Sender email (default: noreply@pepschoolv2.com)
 */
export async function sendEmail({ to, subject, html, from }) {
  const key = process.env.SENDGRID_API_KEY || SENDGRID_API_KEY.value() || null;
  if (!key) throw new Error("SENDGRID_API_KEY not configured");

  sgMail.setApiKey(key);
  await sgMail.send({
    to,
    from: from || "tech@pepschoolv2.com",
    subject,
    html,
  });
}
