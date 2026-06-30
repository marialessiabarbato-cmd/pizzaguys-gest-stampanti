import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type EmailDeliveryMode = "mock" | "resend";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailSendResult {
  ok: true;
  mode: EmailDeliveryMode;
  path?: string;
  messageId?: string;
}

export function getEmailDeliveryMode(): EmailDeliveryMode {
  return process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? "resend" : "mock";
}

async function sendViaResend(message: EmailMessage): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("Resend non configurato");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; error?: string };
  if (!res.ok) {
    throw new Error(body.message ?? body.error ?? `Resend errore ${res.status}`);
  }

  return { ok: true, mode: "resend", messageId: body.id };
}

async function sendViaMock(message: EmailMessage): Promise<EmailSendResult> {
  const dir = process.env.EMAIL_MOCK_DIR ?? "./tmp/emails";
  await mkdir(dir, { recursive: true });
  const safeSubject = message.subject.replace(/[^\w.-]+/g, "-").slice(0, 60);
  const filePath = join(dir, `${Date.now()}-${safeSubject}.html`);
  const envelope = `To: ${message.to}\nSubject: ${message.subject}\nContent-Type: text/html; charset=utf-8\n\n`;
  await writeFile(filePath, envelope + message.html, "utf8");
  return { ok: true, mode: "mock", path: filePath };
}

export async function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  if (getEmailDeliveryMode() === "resend") {
    return sendViaResend(message);
  }
  return sendViaMock(message);
}
