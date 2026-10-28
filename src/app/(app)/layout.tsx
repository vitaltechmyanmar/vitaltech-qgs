import Link from "next/link";
import { requireSession } from "@/lib/session";
import { initials } from "@/lib/domain/format";
import { signOutAction } from "@/app/login/actions";
import { SideNav } from "./side-nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const name = session.user.name ?? session.user.email ?? "Staff";

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            VT
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">VitalTech QGS</p>
            <p className="text-xs text-slate-500">Quotation system</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SideNav isAdmin={session.user.role === "admin"} />
          <Link
            href="/quotations/new"
            className="btn-primary mt-4 w-full"
          >
            New quotation
          </Link>
        </div>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
              {initials(name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs capitalize text-slate-500">{session.user.role}</p>
            </div>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="btn-secondary mt-2 w-full">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <Link href="/quotations" className="font-semibold">
          VitalTech QGS
        </Link>
        <form action={signOutAction}>
          <button type="submit" className="text-sm text-slate-600">
            Sign out
          </button>
        </form>
      </header>

      <div className="md:pl-64">
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
          <SideNav isAdmin={session.user.role === "admin"} />
        </nav>
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
