import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth-guards";
import { errorResponse, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-security";

const ticketSchema = z.object({
  subject: z.string().trim().min(4).max(160),
  message: z.string().trim().min(10).max(5000),
}).strict();

export async function GET() {
  try {
    const user = await requireUser();
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true, authorId: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, { namespace: "support-ticket", limit: 6, windowMs: 60 * 60 * 1000 });
    const user = await requireUser();
    const { subject, message } = ticketSchema.parse(await readJson(request));
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: user.id,
        subject,
        messages: { create: { authorId: user.id, body: message } },
      },
      include: { messages: true },
    });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
