import { getServerSession, type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { pool } from "./db";
import { prisma } from "./prisma";
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 86400 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials) {
        if (
          !credentials?.email ||
          !credentials.password ||
          credentials.password.length > 72
        )
          return null;
        const u = await prisma.users.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
        });
        if (!u || !(await compare(credentials.password, u.password_hash)))
          return null;
        return { id: u.id, email: u.email, name: u.full_name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.uid as string;
      return session;
    },
  },
};
export async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return (
    (
      await pool.query(
        "SELECT id,email,full_name,role FROM users WHERE id=$1",
        [session.user.id],
      )
    ).rows[0] ?? null
  );
}
