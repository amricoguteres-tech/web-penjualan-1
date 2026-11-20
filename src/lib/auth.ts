import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: process.env.AUTH_TRUST_HOST === "true" || process.env.NODE_ENV !== "production",
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (rawCredentials, request) => {
        try {
          await enforceRateLimit(request, {
            namespace: "auth-login",
            limit: 10,
            windowMs: 15 * 60 * 1000,
          });
          const parsed = credentialsSchema.safeParse(rawCredentials);
          if (!parsed.success) return null;

          const email = parsed.data.email.trim().toLowerCase();
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user?.passwordHash || user.disabled) return null;
          if (process.env.REQUIRE_EMAIL_VERIFICATION === "true" && !user.emailVerified) return null;
          if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch (error) {
          if (error instanceof HttpError && error.status === 429) return null;
          throw error;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
        const account = await prisma.user.findUnique({
          where: { id: user.id },
          select: { authVersion: true },
        });
        token.authVersion = account?.authVersion ?? -1;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        const user = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true, disabled: true, authVersion: true },
        });
        const valid = user && !user.disabled && user.authVersion === token.authVersion;
        session.user.id = valid ? token.sub : "";
        session.user.role = valid ? user.role : "USER";
      }
      return session;
    },
  },
});
