import { EmailOutboxStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse, readJson, HttpError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const query = z.object({
      status: z.nativeEnum(EmailOutboxStatus).optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    }).parse(Object.fromEntries(new URL(request.url).searchParams));
    const where = query.status ? { status: query.status } : {};
    const [jobs, total] = await prisma.$transaction([
      prisma.emailOutbox.findMany({
        where,
        select: {
          id: true, recipient: true, subject: true, status: true, attempts: true,
          maxAttempts: true, availableAt: true, sentAt: true, lastError: true, createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * 50,
        take: 50,
      }),
      prisma.emailOutbox.count({ where }),
    ]);
    return NextResponse.json({ jobs, page: query.page, total, pages: Math.ceil(total / 50) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { jobId } = z.object({ jobId: z.string().min(1).max(64) }).strict().parse(await readJson(request));
    const job = await prisma.emailOutbox.findUnique({ where: { id: jobId } });
    if (!job) throw new HttpError(404, "Email job not found", "EMAIL_JOB_NOT_FOUND");
    if (job.status !== EmailOutboxStatus.FAILED) {
      throw new HttpError(409, "Only failed email jobs can be retried manually", "EMAIL_JOB_NOT_FAILED");
    }
    const maxAttempts = Number(process.env.EMAIL_OUTBOX_MAX_ATTEMPTS ?? 8);
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new HttpError(503, "Email retry configuration is invalid", "EMAIL_OUTBOX_CONFIGURATION");
    }
    await prisma.$transaction(async (tx) => {
      await tx.emailOutbox.update({
        where: { id: jobId },
        data: {
          status: EmailOutboxStatus.QUEUED,
          attempts: 0,
          maxAttempts,
          availableAt: new Date(),
          lastError: null,
          lockToken: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "email.outbox.retry",
          entityType: "EmailOutbox",
          entityId: jobId,
        },
      });
    });
    return NextResponse.json({ queued: true });
  } catch (error) {
    return errorResponse(error);
  }
}
