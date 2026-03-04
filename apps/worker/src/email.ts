import { Resend } from "resend";
import { env } from "./env.js";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

export async function sendReminderEmail(to: string, subject: string, body: string) {
  if (!to) return { success: false, message: "missing-recipient" };
  if (!resend) return { success: false, message: "email-disabled" };
  const result = await resend.emails.send({
    from: "Prestamos <noreply@resend.dev>",
    to,
    subject,
    html: `<div style="font-family:Segoe UI,Tahoma,sans-serif;color:#17202a"><h2>${subject}</h2><p>${body}</p></div>`
  });
  return { success: !result.error, message: result.error?.message ?? "sent" };
}
