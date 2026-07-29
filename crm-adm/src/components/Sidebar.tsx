"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Building2, KanbanSquare, ListChecks, MessageCircle, Camera, Settings, LogOut, Menu, X, User, Workflow, CalendarDays, BarChart3, Phone } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useGcAtual } from "@/lib/useGcAtual";
import Avatar from "./Avatar";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/empresas", label: "Empresas", icon: Building2 },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, restrito: true },
  { href: "/atividades", label: "Atividades", icon: ListChecks },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle, restrito: true },
  { href: "/agente-voz", label: "Agente de Voz", icon: Phone },
  { href: "/instagram", label: "Instagram", icon: Camera, restrito: true },
  { href: "/automacoes", label: "Automações", icon: Workflow },
  { href: "/calendario", label: "Agenda da equipe", icon: CalendarDays },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [usuario, setUsuario] = useState<{ nome: string; email: string } | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const { gc } = useGcAtual();
  const semAcesso = gc?.role === "sem_acesso";
  const linksVisiveis = links.filter((l) => !l.restrito || !semAcesso);

  const paginasSemMenu = ["/login", "/redefinir-senha", "/auth"];
  const esconderMenu = paginasSemMenu.some((p) => pathname?.startsWith(p));

  const mostrarTexto = mobileOpen || expanded;

  useEffect(() => {
    if (esconderMenu) return;
    let cancelado = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelado || !data.user) return;
      const nome = (data.user.user_metadata?.nome as string | undefined) ?? data.user.email ?? "Usuário";
      setUsuario({ nome, email: data.user.email ?? "" });
    });
    return () => {
      cancelado = true;
    };
  }, [esconderMenu]);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  if (esconderMenu) {
    return null;
  }

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="md:hidden sticky top-0 z-30 bg-navy h-14 flex items-center px-4 gap-3">
        <button onClick={() => setMobileOpen(true)} className="text-cream p-1" aria-label="Abrir menu">
          <Menu size={22} />
        </button>
        <span className="font-bold text-sm text-cream" style={{ fontFamily: "var(--font-serif-accent)" }}>
          ADM Soluções
        </span>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-navy/50" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => {
          setExpanded(false);
          setProfileOpen(false);
        }}
        className={`fixed md:sticky top-0 left-0 h-screen bg-navy flex flex-col z-50 transition-[width,transform] duration-200 ease-in-out ${
          mobileOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0"
        } ${expanded ? "md:w-64" : "md:w-16"} ${!mobileOpen ? "w-64" : ""}`}
      >
        <div className="flex items-center gap-2.5 px-4 h-16 shrink-0">
          <span className="relative inline-flex w-4 h-4 shrink-0">
            <span className="absolute top-0 right-0 w-3 h-3 rounded-[3px] bg-red" />
            <span className="absolute bottom-0 left-0 w-2 h-2 rounded-[2px] bg-red/70" />
          </span>
          <span
            className="font-bold text-sm text-cream whitespace-nowrap overflow-hidden transition-opacity duration-150"
            style={{ opacity: mostrarTexto ? 1 : 0 }}
          >
            ADM Soluções
          </span>
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden ml-auto text-cream/60 p-1 shrink-0"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 flex flex-col gap-1 px-2.5 py-2 overflow-x-hidden overflow-y-auto">
          {linksVisiveis.map((link) => {
            const active = pathname?.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                title={mostrarTexto ? undefined : link.label}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${
                  active ? "bg-red text-white" : "text-cream/70 hover:bg-white/10 hover:text-cream"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                <span className="overflow-hidden transition-opacity duration-150" style={{ opacity: mostrarTexto ? 1 : 0 }}>
                  {link.label}
                </span>
              </Link>
            );
          })}

          <Link
            href="/configuracoes"
            onClick={() => setMobileOpen(false)}
            title={mostrarTexto ? undefined : "Configurações"}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${
              pathname?.startsWith("/configuracoes") ? "bg-red text-white" : "text-cream/70 hover:bg-white/10 hover:text-cream"
            }`}
          >
            <Settings size={18} className="shrink-0" />
            <span className="overflow-hidden transition-opacity duration-150" style={{ opacity: mostrarTexto ? 1 : 0 }}>
              Configurações
            </span>
          </Link>
        </nav>

        <div ref={profileRef} className="relative px-2.5 py-3 border-t border-white/10">
          {profileOpen && (
            <div className="absolute bottom-full left-2.5 mb-2 w-56 bg-white rounded-lg shadow-lg border border-navy/10 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-navy/5">
                <p className="text-sm font-semibold text-navy truncate">{usuario?.nome}</p>
                <p className="text-xs text-navy/50 truncate">{usuario?.email}</p>
              </div>
              <Link
                href="/configuracoes"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-navy/70 hover:bg-navy/5"
              >
                <User size={14} /> Minha conta
              </Link>
              <button
                onClick={sair}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red hover:bg-red/5"
              >
                <LogOut size={14} /> Sair
              </button>
            </div>
          )}
          <button
            onClick={() => setProfileOpen((v) => !v)}
            title={mostrarTexto ? undefined : "Perfil"}
            className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-md hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            <Avatar nome={usuario?.nome ?? "?"} fotoUrl={gc?.foto_url} tamanho="sm" />
            <span
              className="text-sm text-cream/80 font-medium truncate text-left overflow-hidden transition-opacity duration-150"
              style={{ opacity: mostrarTexto ? 1 : 0 }}
            >
              {usuario?.nome ?? "..."}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
