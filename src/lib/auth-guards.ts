import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { hasAdminAccess } from "@/lib/admin-access";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!hasAdminAccess(user.role)) {
    throw new HttpError(403, "Administrator access required", "FORBIDDEN");
  }
  return user;
}

export async function requirePageUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fdashboard");
  return session.user;
}

export async function requirePageAdmin() {
  const user = await requirePageUser();
  if (!hasAdminAccess(user.role)) redirect("/dashboard");
  return user;
}
