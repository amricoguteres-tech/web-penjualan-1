import nodemailer from "nodemailer10";
import type { Transporter } from "nodemailer10";
import { HttpError } from "@/lib/http";

type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export function assertEmailConfigured() {
  const server = process.env.EMAIL_SERVER;
  const from = process.env.EMAIL_FROM;
  let validServer = false;
  try {
    const url = new URL(server ?? "");
    validServer = ["smtp:", "smtps:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    validServer = false;
  }
  if (!validServer || !from || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) {
    throw new HttpError(503, "Email delivery is not configured", "EMAIL_NOT_CONFIGURED");
  }
  return { server: server!, from };
}

export async function createVerifiedMailTransport(): Promise<Transporter> {
  const { server } = assertEmailConfigured();
  let transport: Transporter | undefined;
  try {
    transport = nodemailer.createTransport(server, {
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 15_000,
    });
    await transport.verify();
  } catch {
    transport?.close();
    console.error("Configured SMTP transport verification failed.");
    throw new HttpError(503, "Email delivery is temporarily unavailable", "EMAIL_UNAVAILABLE");
  }
  return transport;
}

export async function sendVerifiedEmail(message: MailMessage) {
  const transport = await createVerifiedMailTransport();
  try {
    return await sendWithVerifiedTransport(transport, message);
  } finally {
    transport.close();
  }
}

export async function sendWithVerifiedTransport(transport: Transporter, message: MailMessage) {
  try {
    const result = await transport.sendMail({ from: process.env.EMAIL_FROM, ...message });
    const accepted = result.accepted?.some((recipient) => {
      const address = typeof recipient === "string" ? recipient : recipient.address;
      return address.toLowerCase() === message.to.toLowerCase();
    }) ?? false;
    if (!accepted) {
      console.warn("SMTP completed without accepting the requested recipient.");
      throw new Error("SMTP recipient was not accepted");
    }
    return true;
  } catch {
    console.error("Verified SMTP transport failed to deliver an email.");
    throw new HttpError(503, "Email delivery is temporarily unavailable", "EMAIL_DELIVERY_FAILED");
  }
}

export async function trySendNotificationEmail(message: MailMessage) {
  try {
    const acceptedBySmtp = await sendVerifiedEmail(message);
    if (!acceptedBySmtp) {
      console.warn("SMTP did not accept the notification recipient; the in-app notification remains available.");
    }
    return acceptedBySmtp;
  } catch {
    console.warn("Notification email was not delivered; the in-app notification remains available.");
    return false;
  }
}
