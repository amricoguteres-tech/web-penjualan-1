import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({
  email: z.string().trim().email().max(254),
  token: z.string().min(40).max(100),
  password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, { namespace: "auth-reset", limit: 5, windowMs: 15 * 60 * 1000 });
    const { email: rawEmail, token, password } = schema.parse(await readJson(request));
    const email = rawEmail.toLowerCase();
    const identifier = `password-reset:${email}`;
    const hashedToken = createHash("sha256").update(token).digest("hex");
    const record = await prisma.verificationToken.findFirst({
      where: { identifier, token: hashedToken, expires: { gt: new Date() } },
    });
    if (!record) throw new HttpError(400, "Reset link is invalid or expired", "INVALID_RESET_TOKEN");

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new HttpError(400, "Reset link is invalid or expired", "INVALID_RESET_TOKEN");

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, authVersion: { increment: 1 } },
      }),
      prisma.verificationToken.delete({ where: { token: hashedToken } }),
      prisma.auditLog.create({
        data: { actorId: user.id, action: "user.password.reset", entityType: "User", entityId: user.id },
      }),
    ]);
    return NextResponse.json({ message: "Password updated. Sign in with your new password." });
  } catch (error) {
    return errorResponse(error);
  }
}
