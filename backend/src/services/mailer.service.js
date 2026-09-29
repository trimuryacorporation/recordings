import nodemailer from "nodemailer";

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

export function isEmailConfigured() {
  return isConfigured();
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (!isConfigured()) throw new Error("Email service is not configured.");

  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
  const safeName = escapeHtml(name || "there");
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? "TRT Tools <collab@trimuryacorporation.in>",
    to,
    subject: "Reset your TRT Tools password",
    text: `Hello ${name || "there"},\n\nUse this link to reset your password: ${resetUrl}\n\nThis link expires in 30 minutes. If you did not request this, you can safely ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><h2>Password reset request</h2><p>Hello ${safeName},</p><p>We received a request to reset your TRT Tools password.</p><p><a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Reset password</a></p><p>This link expires in 30 minutes. If you did not request this, you can safely ignore this email.</p></div>`
  });
}