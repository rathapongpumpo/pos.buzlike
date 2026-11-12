import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/security";
import { needsVerification } from "@/lib/account-tokens";
import { cookies } from "next/headers";
import { safeNext } from "@/lib/account-links";
import { bindCurrentPilotContext } from "@/lib/pilot-admission";
import { safeServerError } from "@/lib/operations";
import {
  googleConfigured,
  googleLinkCookie,
  GoogleSignInError,
  resolveGoogleAccount,
} from "@/lib/google-auth";
const google = googleConfigured()
  ? [
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        checks: ["pkce", "state"],
        authorization: {
          params: { scope: "openid email profile", prompt: "select_account" },
        },
      }),
    ]
  : [];
export const { handlers, auth, signIn, signOut } = NextAuth({
  debug: false,
  logger: {
    error(error) {
      safeServerError(error);
    },
  },
  trustHost: true,
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = z
          .object({
            email: z.string().email(),
            password: z.string().min(1).max(128),
          })
          .safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.trim().toLowerCase();
        await rateLimit(`login:${email}`, 10, 900000);
        const user = await db.user.findUnique({ where: { email } });
        if (
          !user?.passwordHash ||
          !(await compare(parsed.data.password, user.passwordHash))
        )
          return null;
        await bindCurrentPilotContext(user);
        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
    ...google,
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const jar = await cookies();
        const linkToken = jar.get(googleLinkCookie())?.value;
        const callback =
          jar.get("__Secure-authjs.callback-url")?.value ??
          jar.get("authjs.callback-url")?.value;
        let next = "/start";
        try {
          const url = new URL(callback ?? "/start", process.env.AUTH_URL);
          next = safeNext(url.pathname + url.search);
        } catch {
          /* Use the default safe destination. */
        }
        try {
          const saved = await resolveGoogleAccount(
            profile,
            account.providerAccountId,
            linkToken,
            next,
          );
          user.id = saved.id;
          user.email = saved.email;
          user.name = saved.fullName;
          user.sessionVersion = saved.sessionVersion;
          await bindCurrentPilotContext(saved);
        } catch (error) {
          if (!(error instanceof GoogleSignInError)) throw error;
          return `/login?error=${error.code}&next=${encodeURIComponent(next)}`;
        } finally {
          if (linkToken) jar.delete(googleLinkCookie());
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sessionVersion = user.sessionVersion;
      }
      if (token.sub) {
        const current = await db.user.findUnique({ where: { id: token.sub } });
        if (!current || (token.sessionVersion ?? 0) !== current.sessionVersion)
          return null;
        token.needsVerification = needsVerification(current);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.needsVerification = token.needsVerification === true;
      }
      return session;
    },
  },
  events: {
    async signOut() {
      // End operator impersonation as well as the account login.
      const { cookies } = await import("next/headers");
      const jar = await cookies();
      for (const cookie of jar.getAll()) {
        if (cookie.name.startsWith("pos-staff-")) jar.delete(cookie.name);
      }
    },
  },
});
