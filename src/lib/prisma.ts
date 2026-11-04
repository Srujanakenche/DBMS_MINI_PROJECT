import { PrismaClient } from "@prisma/client";
const cache = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = cache.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") cache.prisma = prisma;
