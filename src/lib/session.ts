import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import type { UserRole } from "@/lib/db/schema";

/**
 * Every page under (app) and every server action calls one of these.
 * Middleware is not used for authorization: the check must happen next to the
 * data, and middleware would run in the edge runtime without DB access.
 */
export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session;
}

export async function requireRole(...roles: UserRole[]): Promise<Session> {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) {
    redirect("/quotations?error=forbidden");
  }
  return session;
}

export async function requireAdmin(): Promise<Session> {
  return requireRole("admin");
}

export async function getOptionalSession(): Promise<Session | null> {
  return auth();
}

export function canEdit(role: UserRole): boolean {
  return role === "admin" || role === "sales";
}
