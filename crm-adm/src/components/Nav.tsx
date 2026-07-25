"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { supabase } from "@/lib/supabase";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/empresas", label: "Empresas" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/atividades", label: "Atividades" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const configAtiva = pathname?.startsWith("/configuracoes");

  const paginasSemMenu = ["/login", "/redefinir-senha", "/auth"];
  if (paginasSemMenu.some((p) => pathname?.startsWith(p))) {
    return null;
  }

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

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
        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/configuracoes"
            className={`p-2 rounded-md transition-colors ${
              configAtiva ? "bg-red text-white" : "text-cream/70 hover:bg-white/10 hover:text-cream"
            }`}
            title="Configurações"
          >
            <Settings size={18} />
          </Link>
          <button
            onClick={sair}
            className="p-2 rounded-md text-cream/70 hover:bg-white/10 hover:text-cream transition-colors"
            title="Sair"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
