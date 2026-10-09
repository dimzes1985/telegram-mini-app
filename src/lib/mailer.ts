import nodemailer from "nodemailer";

// Outgoing mail via SMTP (e.g. smtp.mail.ru:465 with an app password).
export function isMailerConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const from = process.env.SMTP_FROM || `Slot <${process.env.SMTP_USER}>`;
  await transport.sendMail({ from, ...params });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
