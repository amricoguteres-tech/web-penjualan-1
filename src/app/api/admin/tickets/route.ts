import { SupportStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guards";
import { errorResponse, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { enqueueEmail } from "@/lib/email-outbox";

export async function GET() {
  try {
    await requireAdmin();
    const tickets = await prisma.supportTicket.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { ticketId, status, reply } = z.object({
      ticketId: z.string().min(1).max(64),
      status: z.nativeEnum(SupportStatus).optional(),
      reply: z.string().trim().min(1).max(5000).optional(),
    }).strict().refine((value) => value.status || value.reply).parse(await readJson(request));
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.supportTicket.findUniqueOrThrow({
        where: { id: ticketId },
        include: { user: { select: { email: true, name: true } } },
      });
      const updated = await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          ...(status ? { status } : {}),
          ...(reply ? { messages: { create: { authorId: admin.id, body: reply } } } : {}),
        },
      });
      await tx.auditLog.create({
        data: { actorId: admin.id, action: "support.ticket.update", entityType: "SupportTicket", entityId: ticketId, metadata: { status, replied: Boolean(reply) } },
      });
      if (reply || status) {
        await tx.notification.create({
          data: { userId: current.userId, title: "Support ticket updated", body: `There is an update to your ticket: ${current.subject}` },
        });
        await enqueueEmail(tx, {
          to: current.user.email,
          subject: "NEBULA X support ticket update",
          text: `Hello ${current.user.name ?? "customer"}, your ticket "${current.subject}" has been updated. Sign in to your NEBULA X dashboard to view the response.`,
        }, `support-ticket:${ticketId}:${updated.updatedAt.toISOString()}:${reply ? "reply" : "status"}`);
      }
      return updated;
    });
    return NextResponse.json({ ticket: result });
  } catch (error) {
    return errorResponse(error);
  }
}
