import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(message: EmailMessage): Promise<{ ok: true; path?: string }> {
  const dir = process.env.EMAIL_MOCK_DIR ?? "./tmp/emails";
  await mkdir(dir, { recursive: true });
  const safeSubject = message.subject.replace(/[^\w.-]+/g, "-").slice(0, 60);
  const filePath = join(dir, `${Date.now()}-${safeSubject}.html`);
  const envelope = `To: ${message.to}\nSubject: ${message.subject}\nContent-Type: text/html; charset=utf-8\n\n`;
  await writeFile(filePath, envelope + message.html, "utf8");
  return { ok: true, path: filePath };
}
