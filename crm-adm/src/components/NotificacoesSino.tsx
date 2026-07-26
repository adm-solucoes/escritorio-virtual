"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Gc, Notificacao } from "@/lib/types";

const PAGINAS_SEM_MENU = ["/login", "/redefinir-senha", "/auth"];
const INTERVALO_ATUALIZACAO_MS = 60_000;

function linkDaNotificacao(n: Notificacao): string | null {
  if (!n.link_id) return null;
  if (n.link_tipo === "empresa") return `/empresas/${n.link_id}`;
  if (n.link_tipo === "oportunidade") return `/pipeline/${n.link_id}`;
  if (n.link_tipo === "atividade") return `/atividades`;
  if (n.link_tipo === "sugestao_ia") return `/automacoes/sugestoes`;
  return null;
}

function tempoRelativo(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias}d`;
}

export default function NotificacoesSino() {
  const pathname = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [gcAtual, setGcAtual] = useState<Gc | null>(null);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const painelRef = useRef<HTMLDivElement>(null);

  const esconderNaPagina = PAGINAS_SEM_MENU.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (esconderNaPagina) return;
    let cancelado = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelado || !data.user?.email) return;
      const { data: gc } = await supabase.from("gcs").select("*").eq("email", data.user.email).maybeSingle();
      if (!cancelado) setGcAtual(gc ?? null);
    });
    return () => {
      cancelado = true;
    };
  }, [esconderNaPagina]);

  useEffect(() => {
    if (!gcAtual) return;
    let cancelado = false;

    function carregar() {
      supabase
        .from("notificacoes")
        .select("*")
        .eq("gc_id", gcAtual!.id)
        .eq("lida", false)
        .order("criado_em", { ascending: false })
        .limit(30)
        .then(({ data }) => {
          if (!cancelado) setNotificacoes((data as Notificacao[]) ?? []);
        });
    }

    carregar();
    const intervalo = setInterval(carregar, INTERVALO_ATUALIZACAO_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [gcAtual]);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (painelRef.current && !painelRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  async function marcarComoLida(n: Notificacao) {
    setNotificacoes((prev) => prev.filter((x) => x.id !== n.id));
    await supabase.from("notificacoes").update({ lida: true }).eq("id", n.id);
    const link = linkDaNotificacao(n);
    setAberto(false);
    if (link) router.push(link);
  }

  async function marcarTodasComoLidas() {
    if (!gcAtual || notificacoes.length === 0) return;
    const ids = notificacoes.map((n) => n.id);
    setNotificacoes([]);
    await supabase.from("notificacoes").update({ lida: true }).in("id", ids);
  }

  if (esconderNaPagina || !gcAtual || gcAtual.role === "sem_acesso") return null;

  return (
    <div ref={painelRef} className="fixed top-4 right-5 z-40">
      <button
        onClick={() => setAberto((v) => !v)}
        className="relative w-11 h-11 rounded-full bg-white shadow-lg border border-navy/10 flex items-center justify-center text-navy/70 hover:text-navy"
        title="Notificações"
      >
        <Bell size={18} />
        {notificacoes.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red text-white text-[10px] font-bold flex items-center justify-center">
            {notificacoes.length > 9 ? "9+" : notificacoes.length}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-navy/10">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-navy/10 sticky top-0 bg-white">
            <span className="text-sm font-bold text-navy">Notificações</span>
            {notificacoes.length > 0 && (
              <button onClick={marcarTodasComoLidas} className="text-xs font-semibold text-blue hover:underline">
                Marcar todas como lidas
              </button>
            )}
          </div>
          {notificacoes.length === 0 ? (
            <p className="p-4 text-xs text-navy/40">Nenhuma notificação nova.</p>
          ) : (
            <div className="divide-y divide-navy/5">
              {notificacoes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => marcarComoLida(n)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-navy/[0.03] flex flex-col gap-0.5"
                >
                  <span className="text-navy">{n.mensagem}</span>
                  <span className="text-[11px] text-navy/40">{tempoRelativo(n.criado_em)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
