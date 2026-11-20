import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, errorResponse, readJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-security";
import { assertEmailConfigured } from "@/lib/mailer";
import { enqueueEmail } from "@/lib/email-outbox";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, { namespace: "auth-register", limit: 5, windowMs: 60 * 60 * 1000 });
    const body = registerSchema.parse(await readJson(request));
    const email = body.email.toLowerCase();
    const requireVerification = process.env.REQUIRE_EMAIL_VERIFICATION === "true";
    if (requireVerification && !process.env.NEXT_PUBLIC_SITE_URL) {
      throw new HttpError(503, "Email verification is not configured", "EMAIL_VERIFICATION_NOT_CONFIGURED");
    }
    if (requireVerification) assertEmailConfigured();
    const passwordHash = await bcrypt.hash(body.password, 12);
    const verificationToken = requireVerification ? randomBytes(32).toString("base64url") : null;
    const hashedToken = verificationToken ? createHash("sha256").update(verificationToken).digest("hex") : null;

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: body.name,
          email,
          passwordHash,
          wallet: { create: {} },
          cart: { create: {} },
        },
        select: { id: true, email: true, name: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: created.id,
          action: "user.register",
          entityType: "User",
          entityId: created.id,
        },
      });
      if (verificationToken && hashedToken && process.env.NEXT_PUBLIC_SITE_URL) {
        const identifier = `email-verification:${email}`;
        await tx.verificationToken.create({
          data: {
            identifier,
            token: hashedToken,
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        const verificationUrl = new URL("/verify-email", process.env.NEXT_PUBLIC_SITE_URL);
        verificationUrl.searchParams.set("token", verificationToken);
        verificationUrl.searchParams.set("email", email);
        await enqueueEmail(tx, {
          to: email,
          subject: "Verify your NEBULA X account",
          text: `Verify your email within 24 hours: ${verificationUrl}`,
        }, `email-verification:${hashedToken}`);
      }
      return created;
    });

    return NextResponse.json({
      user,
      verificationRequired: requireVerification,
      message: requireVerification ? "Check your email to verify your account before signing in." : undefined,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return NextResponse.json(
        { error: "An account with this email already exists", code: "EMAIL_IN_USE" },
        { status: 409 },
      );
    }
    if (error instanceof HttpError || error instanceof z.ZodError) return errorResponse(error);
    return errorResponse(error);
  }
}
