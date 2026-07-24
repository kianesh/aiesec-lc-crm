import { Resend } from "resend";

// Minimal transactional email helper (invites, notifications). Returns whether
// the email was actually sent — callers fall back to showing a link when not.
export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false, error: "email_not_configured" };
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "email_send_failed" };
  }
}

export function inviteEmailHtml(input: { lcName: string; role: string; inviteUrl: string; inviterName?: string }): string {
  const who = input.inviterName ? `${input.inviterName} invited you` : "You've been invited";
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
    <h2 style="margin:0 0 8px">${who} to ${input.lcName}</h2>
    <p style="color:#5f6b80;line-height:1.5">
      You've been invited to join <strong>${input.lcName}</strong> on the AIESEC CRM as
      <strong>${input.role}</strong>. Click below to accept and set up your account.
    </p>
    <p style="margin:24px 0">
      <a href="${input.inviteUrl}"
         style="background:#037ef3;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">
        Accept invitation
      </a>
    </p>
    <p style="color:#8b94a6;font-size:12px">Or paste this link into your browser:<br>${input.inviteUrl}</p>
  </div>`;
}
