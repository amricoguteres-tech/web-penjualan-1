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
const response = { message: "If verification is required, a link will be sent to that address." };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, { namespace: "email-verification-resend", limit: 5, windowMs: 60 * 60 * 1000 });
    const { email: rawEmail } = schema.parse(await readJson(request));
    const email = rawEmail.toLowerCase();
    if (process.env.REQUIRE_EMAIL_VERIFICATION !== "true" || !process.env.NEXT_PUBLIC_SITE_URL) {
      return NextResponse.json(response);
    }

    assertEmailConfigured();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { email: true, emailVerified: true, disabled: true },
    });
    if (!user || user.emailVerified || user.disabled) return NextResponse.json(response);

    const token = randomBytes(32).toString("base64url");
    const hashedToken = createHash("sha256").update(token).digest("hex");
    const identifier = `email-verification:${email}`;
    const verificationUrl = new URL("/verify-email", process.env.NEXT_PUBLIC_SITE_URL);
    verificationUrl.searchParams.set("token", token);
    verificationUrl.searchParams.set("email", email);
    await prisma.$transaction(async (tx) => {
      await tx.verificationToken.deleteMany({ where: { identifier } });
      await tx.verificationToken.create({
        data: { identifier, token: hashedToken, expires: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      });
      await enqueueEmail(tx, {
        to: email,
        subject: "Verify your NEBULA X account",
        text: `Verify your email within 24 hours: ${verificationUrl}`,
      }, `email-verification:${hashedToken}`);
    });
    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
