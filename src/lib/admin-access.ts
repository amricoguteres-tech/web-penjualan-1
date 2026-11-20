import { UserRole } from "@prisma/client";

export function hasAdminAccess(role: UserRole | string | null | undefined) {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}
