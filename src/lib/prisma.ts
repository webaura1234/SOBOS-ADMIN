import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function datasourceUrl() {
  const raw = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    const isPooler = url.port === "6543" || url.hostname.includes("pooler");
    if (isPooler) {
      if (!url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
      if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "5");
      if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: datasourceUrl(),
      },
    },
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
