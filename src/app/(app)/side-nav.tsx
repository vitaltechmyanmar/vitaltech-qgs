"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/quotations", label: "Quotations" },
  { href: "/products", label: "Products" },
  { href: "/customers", label: "Customers" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {links
        .filter((link) => link.href !== "/settings" || isAdmin)
        .map((link) => {
          const active =
            pathname === link.href ||
            (link.href !== "/quotations" && pathname.startsWith(`${link.href}/`)) ||
            (link.href === "/quotations" && pathname.startsWith("/quotations"));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
    </nav>
  );
}
