import nodemailer from "nodemailer";
import { AppSetting } from "../core/models.js";

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function configured(values) {
  return Boolean(values.host && values.user && values.password);
}

function environmentConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT ?? 587) === 465,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM
  };
}

async function emailConfig() {
  const settings = await AppSetting.findOne({ key: "global" }).select("+smtpPassword").lean();
  const databaseConfig = settings && {
    host: settings.smtpHost,
    port: Number(settings.smtpPort ?? 587),
    secure: Boolean(settings.smtpSecure),
    user: settings.smtpUser,
    password: settings.smtpPassword,
    from: settings.smtpFrom
  };
  return configured(databaseConfig ?? {}) ? databaseConfig : environmentConfig();
}

export async function isEmailConfigured() {
  return configured(await emailConfig());
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const config = await emailConfig();
  if (!configured(config)) throw new Error("Email service is not configured.");

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465 || (config.secure && config.port !== 587),
    auth: { user: config.user, pass: config.password }
  });
  const safeName = escapeHtml(name || "there");
  await transport.sendMail({
    from: config.from || "TRT Tools <collab@trimuryacorporation.in>",
    to,
    subject: "Reset your TRT Tools password",
    text: `Hello ${name || "there"},\n\nUse this link to reset your password: ${resetUrl}\n\nThis link expires in 30 minutes. If you did not request this, you can safely ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><h2>Password reset request</h2><p>Hello ${safeName},</p><p>We received a request to reset your TRT Tools password.</p><p><a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Reset password</a></p><p>This link expires in 30 minutes. If you did not request this, you can safely ignore this email.</p></div>`
  });
}