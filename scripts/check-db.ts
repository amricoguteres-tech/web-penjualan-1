import { prisma } from "../src/lib/prisma";

async function main() {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.info("PostgreSQL connection verified.");
  } catch {
    console.error("PostgreSQL connection failed. Check DATABASE_URL, network access, and database availability.");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
