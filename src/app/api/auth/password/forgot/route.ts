import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-security";
import { assertEmailConfigured } from "@/lib/mailer";
import { enqueueEmail } from "@/lib/email-outbox";

const schema = z.object({ email: z.string().trim().email().max(254) }).strict();
const genericResponse = {
  message: "If the account can be recovered, password reset instructions will be sent.",
};

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, { namespace: "auth-forgot", limit: 5, windowMs: 60 * 60 * 1000 });
    const { email: inputEmail } = schema.parse(await readJson(request));
    const email = inputEmail.toLowerCase();
    if (!process.env.NEXT_PUBLIC_SITE_URL) throw new Error("NEXT_PUBLIC_SITE_URL is required for password reset links");
    assertEmailConfigured();
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, disabled: true } });
    if (!user || user.disabled) return NextResponse.json(genericResponse);

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const identifier = `password-reset:${email}`;
    const expires = new Date(Date.now() + 30 * 60 * 1000);
    const resetUrl = new URL("/reset-password", process.env.NEXT_PUBLIC_SITE_URL);
    resetUrl.searchParams.set("token", token);
    resetUrl.searchParams.set("email", email);
    await prisma.$transaction(async (tx) => {
      await tx.verificationToken.deleteMany({ where: { identifier } });
      await tx.verificationToken.create({ data: { identifier, token: tokenHash, expires } });
      await enqueueEmail(tx, {
        to: email,
        subject: "Reset your NEBULA X password",
        text: `Use this one-time link within 30 minutes to reset your password: ${resetUrl}`,
      }, `password-reset:${tokenHash}`);
    });

    return NextResponse.json(genericResponse);
  } catch (error) {
    return errorResponse(error);
  }
}
