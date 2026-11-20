import { UserRole, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const categories = [
  { name: "Websites", slug: "websites" },
  { name: "Applications", slug: "applications" },
  { name: "VPS", slug: "vps" },
  { name: "Hosting", slug: "hosting" },
  { name: "Games", slug: "games" },
  { name: "Scripts & templates", slug: "scripts" },
  { name: "Digital products", slug: "digital-products" },
];

async function main() {
  for (const category of categories) {
    await prisma.productCategory.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category,
    });
  }

  const adminEmail = process.env.NEBULA_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.NEBULA_ADMIN_PASSWORD;
  if (adminEmail || adminPassword) {
    if (!adminEmail || !adminPassword || adminPassword.length < 16) {
      throw new Error("Set both NEBULA_ADMIN_EMAIL and a NEBULA_ADMIN_PASSWORD of at least 16 characters.");
    }
    const existing = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
    if (existing) {
      console.info("Admin bootstrap skipped: the account already exists; seed never promotes existing users.");
    } else {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      const user = await prisma.user.create({
        data: { email: adminEmail, passwordHash, role: UserRole.ADMIN, name: "NEBULA X Administrator" },
        select: { id: true },
      });
      await prisma.auditLog.create({
        data: { actorId: user.id, action: "admin.bootstrap", entityType: "User", entityId: user.id },
      });
      console.info("Initial administrator account created.");
    }
  }

  console.info("NEBULA X categories are ready. No products, customers, orders, or payments were fabricated.");
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
