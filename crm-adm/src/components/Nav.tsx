"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/empresas", label: "Empresas" },
  { href: "/pipeline", label: "Pipeline" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-black/10 bg-white sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-6">
        <span className="font-semibold text-sm tracking-tight">CRM ADM Soluções</span>
        <nav className="flex gap-1">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-black text-white"
                    : "text-black/70 hover:bg-black/5"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
