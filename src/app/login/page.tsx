import { redirect } from "next/navigation";
import { getOptionalSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getOptionalSession();
  if (session) redirect("/quotations");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            VT
          </div>
          <h1 className="text-xl font-semibold tracking-tight">VitalTech QGS</h1>
          <p className="mt-1 text-sm text-slate-500">
            Internal quotation system · staff sign-in only
          </p>
        </div>

        <div className="card p-6">
          <LoginForm />
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Accounts are created by an administrator. There is no public sign-up.
        </p>
      </div>
    </main>
  );
}
