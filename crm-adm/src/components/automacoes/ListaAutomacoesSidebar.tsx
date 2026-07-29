"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Search, Workflow } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Automacao } from "@/lib/types";

/** Lista fixa de automações ao lado do editor — deixa trocar de automação
 * sem sair da tela do canvas, igual navegar entre arquivos num editor de
 * código. Fica visível tanto em /automacoes quanto em /automacoes/[id]. */
export default function ListaAutomacoesSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [automacoes, setAutomacoes] = useState<Automacao[]>([]);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("automacoes")
      .select("*")
      .order("nome")
      .then(({ data }) => {
        if (!cancelado) setAutomacoes((data as Automacao[]) ?? []);
      });
    return () => {
      cancelado = true;
    };
  }, [pathname]);

  const filtradas = automacoes.filter((a) => a.nome.toLowerCase().includes(busca.toLowerCase()));

  async function criarNova() {
    setCriando(true);
    const { data, error } = await supabase
      .from("automacoes")
      .insert({ nome: "Nova automação", descricao: "" })
      .select("id")
      .single();
    setCriando(false);
    if (error || !data) {
      alert("Erro ao criar automação: " + (error?.message ?? "desconhecido"));
      return;
    }
    router.push(`/automacoes/${data.id}`);
  }

  return (
    <div className="w-60 shrink-0 border-r border-navy/10 bg-white flex flex-col">
      <div className="px-3 pt-3 pb-2">
        <h2 className="font-bold text-sm text-navy flex items-center gap-1.5">
          <Workflow size={15} /> Automações
        </h2>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-navy/30" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar..."
            className="w-full text-xs border border-navy/15 rounded-md pl-7 pr-2 py-1.5 outline-none focus:border-blue"
          />
        </div>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={criarNova}
          disabled={criando}
          className="btn-primary w-full justify-center text-xs py-1.5 disabled:opacity-50"
        >
          <Plus size={14} /> Adicionar automação
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {filtradas.length === 0 ? (
          <p className="text-xs text-navy/40 px-2 py-2">Nenhuma automação encontrada.</p>
        ) : (
          filtradas.map((automacao) => {
            const ativa = pathname === `/automacoes/${automacao.id}`;
            return (
              <Link
                key={automacao.id}
                href={`/automacoes/${automacao.id}`}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                  ativa ? "bg-navy text-white" : "text-navy/70 hover:bg-navy/5"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    automacao.status === "ativa" ? "bg-green-500" : ativa ? "bg-white/40" : "bg-navy/20"
                  }`}
                />
                <span className="truncate">{automacao.nome}</span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
