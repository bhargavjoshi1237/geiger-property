import { sendNotificationEmail } from "@/lib/email/notifications";

// Server-only channel delivery. Email goes through geiger-dash (template
// `property.message` unless a notification overrides it); SMS has no provider
// yet, so it is modelled and stored as "not sent"; portal / note are log-only.
// Returns { status: sent|failed|not_sent|skipped|logged, error?, providerId? }.

export const DELIVERY_STATUS = {
  sent: "sent",
  failed: "failed",
  notSent: "not_sent",
  skipped: "skipped",
  logged: "logged",
  received: "received",
};

export const SMS_NOT_CONNECTED = "SMS provider not connected";
export const EMAIL_NOT_CONFIGURED = "Email delivery isn't configured (GEIGER_EMAIL_API_KEY)";

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

// No SMS provider is chosen yet — record the attempt, never crash.
export async function sendSms() {
  return { status: DELIVERY_STATUS.notSent, error: SMS_NOT_CONNECTED };
}

// Paragraph-split plain text for the email template.
const paragraphs = (body) =>
  String(body || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

export async function deliver({
  db,
  projectId,
  channel = "email",
  to,
  recipientName,
  subject,
  body,
  notification = "message",
  template,
  data = {},
}) {
  const ch = String(channel || "email").toLowerCase();
  if (ch === "sms") return sendSms({ to, body });
  if (ch !== "email") return { status: DELIVERY_STATUS.logged };
  if (!to) return { status: DELIVERY_STATUS.failed, error: "No email address on file" };

  const res = await sendNotificationEmail({
    db,
    projectId,
    notification,
    template,
    to,
    subject,
    data: {
      recipientName: recipientName || "",
      subject: subject || "",
      body: body || "",
      paragraphs: paragraphs(body),
      ctaUrl: data.ctaUrl || appUrl() || undefined,
      ...data,
    },
  });
  if (res.ok) return { status: DELIVERY_STATUS.sent, providerId: res.providerId || res.id || null };
  if (res.skipped) return { status: DELIVERY_STATUS.skipped, error: "Turned off in Notifications settings" };
  if (res.error === "not_configured") return { status: DELIVERY_STATUS.notSent, error: EMAIL_NOT_CONFIGURED };
  return { status: DELIVERY_STATUS.failed, error: String(res.error || "Send failed") };
}
