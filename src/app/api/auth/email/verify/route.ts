import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { enforceRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().email().max(254),
  token: z.string().min(40).max(100),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, { namespace: "email-verification", limit: 10, windowMs: 60 * 60 * 1000 });
    const { email: rawEmail, token } = schema.parse(await readJson(request));
    const email = rawEmail.toLowerCase();
    const identifier = `email-verification:${email}`;
    const hashedToken = createHash("sha256").update(token).digest("hex");
    await prisma.$transaction(async (tx) => {
      const record = await tx.verificationToken.findFirst({
        where: { identifier, token: hashedToken, expires: { gt: new Date() } },
      });
      if (!record) throw new HttpError(400, "Verification link is invalid or expired", "INVALID_VERIFICATION_TOKEN");
      const user = await tx.user.update({
        where: { email },
        data: { emailVerified: new Date(), authVersion: { increment: 1 } },
        select: { id: true },
      });
      await tx.verificationToken.delete({ where: { token: hashedToken } });
      await tx.auditLog.create({
        data: { actorId: user.id, action: "user.email.verify", entityType: "User", entityId: user.id },
      });
      return user;
    });
    return NextResponse.json({ verified: true, message: "Email verified. You can now sign in." });
  } catch (error) {
    return errorResponse(error);
  }
}
