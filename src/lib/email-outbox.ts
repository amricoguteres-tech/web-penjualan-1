import { EmailOutboxStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { HttpError } from "@/lib/http";
import {
  decryptEmailOutboxBody,
  encryptEmailOutboxBody,
  getEmailOutboxEncryptionKey,
  isEncryptedEmailOutboxBody,
} from "@/lib/email-outbox-crypto";
import { sendVerifiedEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

type MailJob = { to: string; subject: string; text: string };
type DbClient = Prisma.TransactionClient | typeof prisma;

const DEFAULT_MAX_ATTEMPTS = 8;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export async function enqueueEmail(db: DbClient, message: MailJob, idempotencyKey: string) {
  getEmailOutboxEncryptionKey();
  const maxAttempts = Number(process.env.EMAIL_OUTBOX_MAX_ATTEMPTS ?? DEFAULT_MAX_ATTEMPTS);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw new HttpError(503, "Email outbox configuration is invalid", "EMAIL_OUTBOX_CONFIGURATION");
  }
  return db.emailOutbox.upsert({
    where: { idempotencyKey },
    create: {
      idempotencyKey,
      recipient: message.to.toLowerCase(),
      subject: message.subject,
      textBody: encryptEmailOutboxBody(message.text),
      maxAttempts,
    },
    update: {},
    select: { id: true, status: true },
  });
}

export function emailRetryDelayMs(attempt: number) {
  const baseMs = Number(process.env.EMAIL_OUTBOX_RETRY_BASE_MS ?? 30_000);
  const maxMs = Number(process.env.EMAIL_OUTBOX_RETRY_MAX_MS ?? 21_600_000);
  if (!Number.isSafeInteger(baseMs) || baseMs < 1_000 || !Number.isSafeInteger(maxMs) || maxMs < baseMs) {
    throw new HttpError(503, "Email retry configuration is invalid", "EMAIL_OUTBOX_CONFIGURATION");
  }
  return Math.min(maxMs, baseMs * 2 ** Math.min(attempt - 1, 16));
}

function permanentEmailFailure(error: unknown) {
  return error instanceof HttpError &&
    (error.code === "EMAIL_NOT_CONFIGURED" ||
      error.code === "EMAIL_OUTBOX_CONFIGURATION" ||
      error.code === "EMAIL_OUTBOX_CIPHERTEXT_INVALID");
}

function safeErrorMessage(error: unknown) {
  const raw = error instanceof HttpError ? `${error.code}: ${error.message}` : "SMTP delivery failed";
  return raw.replace(/[\r\n]/g, " ").slice(0, 500);
}

async function claimNextEmail() {
  getEmailOutboxEncryptionKey();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  await prisma.emailOutbox.updateMany({
    where: {
      attempts: { gte: prisma.emailOutbox.fields.maxAttempts },
      OR: [
        { status: EmailOutboxStatus.QUEUED },
        { status: EmailOutboxStatus.PROCESSING, startedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: EmailOutboxStatus.FAILED,
      lastError: "Maximum email delivery attempts exhausted",
      lockToken: null,
    },
  });
  const candidate = await prisma.emailOutbox.findFirst({
    where: {
      attempts: { lt: prisma.emailOutbox.fields.maxAttempts },
      OR: [
        { status: EmailOutboxStatus.QUEUED, availableAt: { lte: now } },
        { status: EmailOutboxStatus.PROCESSING, startedAt: { lt: staleBefore } },
      ],
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return null;

  const lockToken = randomUUID();
  const claimed = await prisma.emailOutbox.updateMany({
    where: {
      id: candidate.id,
      status: candidate.status,
      updatedAt: candidate.updatedAt,
      ...(candidate.status === EmailOutboxStatus.QUEUED
        ? { availableAt: { lte: now } }
        : { startedAt: { lt: staleBefore } }),
    },
    data: {
      status: EmailOutboxStatus.PROCESSING,
      attempts: { increment: 1 },
      startedAt: now,
      lockToken,
    },
  });
  if (claimed.count !== 1) return null;
  return { ...candidate, attempts: candidate.attempts + 1, lockToken };
}

export async function processEmailOutboxBatch(limit = 10) {
  const safeLimit = Math.min(20, Math.max(1, Math.trunc(limit)));
  const results: Array<{ id: string; status: string }> = [];
  for (let index = 0; index < safeLimit; index += 1) {
    const job = await claimNextEmail();
    if (!job) break;
    try {
      let encryptedBody = job.textBody;
      if (!isEncryptedEmailOutboxBody(encryptedBody)) {
        encryptedBody = encryptEmailOutboxBody(encryptedBody);
        const migrated = await prisma.emailOutbox.updateMany({
          where: { id: job.id, status: EmailOutboxStatus.PROCESSING, lockToken: job.lockToken },
          data: { textBody: encryptedBody },
        });
        if (migrated.count !== 1) continue;
      }
      await sendVerifiedEmail({
        to: job.recipient,
        subject: job.subject,
        text: decryptEmailOutboxBody(encryptedBody),
      });
      await prisma.emailOutbox.updateMany({
        where: { id: job.id, status: EmailOutboxStatus.PROCESSING, lockToken: job.lockToken },
        data: {
          status: EmailOutboxStatus.SENT,
          sentAt: new Date(),
          lastError: null,
          lockToken: null,
        },
      });
      results.push({ id: job.id, status: "sent" });
    } catch (error) {
      const failedPermanently = permanentEmailFailure(error) || job.attempts >= job.maxAttempts;
      const status = failedPermanently ? EmailOutboxStatus.FAILED : EmailOutboxStatus.QUEUED;
      const data = failedPermanently
        ? { status, lastError: safeErrorMessage(error), lockToken: null }
        : {
          status,
          lastError: safeErrorMessage(error),
          availableAt: new Date(Date.now() + emailRetryDelayMs(job.attempts)),
          lockToken: null,
        };
      await prisma.emailOutbox.updateMany({
        where: { id: job.id, status: EmailOutboxStatus.PROCESSING, lockToken: job.lockToken },
        data,
      });
      results.push({ id: job.id, status: failedPermanently ? "failed" : "queued_for_retry" });
    }
  }
  return results;
}

export function verifyWorkerSecret(request: Request, variableName: "OUTBOX_WORKER_SECRET" | "PAYMENT_RECONCILIATION_SECRET") {
  const expected = process.env[variableName];
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  }
  return mismatch === 0;
}
