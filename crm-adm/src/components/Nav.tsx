"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

const links = [
  { href: "/empresas", label: "Empresas" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/atividades", label: "Atividades" },
];

export default function Nav() {
  const pathname = usePathname();
  const configAtiva = pathname?.startsWith("/configuracoes");

  return (
    <header className="bg-navy sticky top-0 z-20 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-6">
        <span
          className="font-bold text-sm tracking-tight text-cream flex items-center gap-2"
          style={{ fontFamily: "var(--font-serif-accent)" }}
        >
          <span className="relative inline-flex w-4 h-4">
            <span className="absolute top-0 right-0 w-3 h-3 rounded-[3px] bg-red" />
            <span className="absolute bottom-0 left-0 w-2 h-2 rounded-[2px] bg-red/70" />
          </span>
          ADM Soluções
        </span>
        <nav className="flex gap-1">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  active
                    ? "bg-red text-white"
                    : "text-cream/70 hover:bg-white/10 hover:text-cream"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/configuracoes"
          className={`ml-auto p-2 rounded-md transition-colors ${
            configAtiva ? "bg-red text-white" : "text-cream/70 hover:bg-white/10 hover:text-cream"
          }`}
          title="Configurações"
        >
          <Settings size={18} />
        </Link>
      </div>
    </header>
  );
}
