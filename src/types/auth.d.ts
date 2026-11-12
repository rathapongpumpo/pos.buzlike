import type { DefaultSession } from "next-auth";
declare module "next-auth" {
  interface Session {
    user: { id: string; needsVerification: boolean } & DefaultSession["user"];
  }
  interface User {
    sessionVersion?: number;
  }
}
