"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Phone, MessageSquareText, Workflow, ExternalLink, CheckCircle2, Settings } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/Badge";

type UsoIA = { custoHojeUsd: number; custoMesUsd: number };

/** Painel central pra enxergar todos os "agentes de IA" que a ADM Soluções
 * já usa em produção — cada um roda numa parte diferente do sistema, então
 * sem essa página fica difícil ter noção do conjunto. */
export default function AgentesIaPage() {
  const [uso, setUso] = useState<UsoIA | null>(null);
  const [totalAutomacoesIA, setTotalAutomacoesIA] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/ia/uso")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUso(d))
      .catch(() => setUso(null));

    supabase
      .from("automacao_nos")
      .select("id", { count: "exact", head: true })
      .eq("tipo", "acao_resumir_ia")
      .then(({ count }) => setTotalAutomacoesIA(count ?? 0));
  }, []);

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div>
        <h1 className="titulo-pagina flex items-center gap-2">
          <Bot size={20} /> Agentes de IA
        </h1>
        <p className="text-sm text-navy/60">Onde a inteligência artificial já trabalha pra ADM Soluções hoje.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border-l-[3px] border-l-navy border-y border-r border-navy/15 shadow-sm p-4">
          <p className="text-xs font-semibold text-navy/50">Custo de IA hoje</p>
          <p className="text-lg font-extrabold text-navy mt-1">
            {uso ? `$${uso.custoHojeUsd.toFixed(3)}` : "—"}
          </p>
        </div>
        <div className="bg-white rounded-lg border-l-[3px] border-l-navy border-y border-r border-navy/15 shadow-sm p-4">
          <p className="text-xs font-semibold text-navy/50">Custo de IA este mês</p>
          <p className="text-lg font-extrabold text-navy mt-1">{uso ? `$${uso.custoMesUsd.toFixed(2)}` : "—"}</p>
        </div>
        <div className="bg-white rounded-lg border-l-[3px] border-l-navy border-y border-r border-navy/15 shadow-sm p-4">
          <p className="text-xs font-semibold text-navy/50">Passos de IA em automações</p>
          <p className="text-lg font-extrabold text-navy mt-1">{totalAutomacoesIA ?? "—"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white rounded-lg border-l-[3px] border-l-navy border-y border-r border-navy/15 shadow-sm p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Phone size={18} className="text-navy shrink-0" />
              <div>
                <p className="font-bold text-navy text-sm">Fernanda</p>
                <p className="text-xs text-navy/50">Agente de voz outbound</p>
              </div>
            </div>
            <Badge variant="success" icon={CheckCircle2}>
              Ativo
            </Badge>
          </div>
          <p className="text-sm text-navy/70">
            Liga pra prospects, qualifica o interesse com SPIN Selling leve e agenda um briefing direto na agenda real
            do time comercial — tudo por telefone, sem intervenção humana na ligação em si.
          </p>
          <div className="flex items-center justify-between mt-auto">
            <Link href="/agente-voz" className="text-xs font-semibold text-blue hover:underline">
              Ver ligações e prospects →
            </Link>
            <Link href="/agentes-ia/agente-voz" className="flex items-center gap-1 text-xs font-semibold text-navy/50 hover:text-navy">
              <Settings size={12} /> Editar
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg border-l-[3px] border-l-navy border-y border-r border-navy/15 shadow-sm p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <MessageSquareText size={18} className="text-navy shrink-0" />
              <div>
                <p className="font-bold text-navy text-sm">Assistente comercial</p>
                <p className="text-xs text-navy/50">Chat embutido no CRM</p>
              </div>
            </div>
            <Badge variant="success" icon={CheckCircle2}>
              Ativo
            </Badge>
          </div>
          <p className="text-sm text-navy/70">
            Botão flutuante disponível em todas as telas (menos login) — responde perguntas sobre a carteira, marca e
            cancela reunião na agenda de cada GC, sempre pela sessão real de quem está logado.
          </p>
          <div className="flex items-center justify-between mt-auto">
            <span className="text-xs text-navy/40">Disponível no canto inferior direito de qualquer página</span>
            <Link href="/agentes-ia/assistente-chat" className="flex items-center gap-1 text-xs font-semibold text-navy/50 hover:text-navy shrink-0">
              <Settings size={12} /> Editar
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg border-l-[3px] border-l-navy border-y border-r border-navy/15 shadow-sm p-5 flex flex-col gap-3 md:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Workflow size={18} className="text-navy shrink-0" />
              <div>
                <p className="font-bold text-navy text-sm">Nós de IA nas automações</p>
                <p className="text-xs text-navy/50">Dentro do canvas de automação</p>
              </div>
            </div>
          </div>
          <p className="text-sm text-navy/70">
            Blocos de IA que podem ser encaixados em qualquer fluxo de automação — hoje usados pra resumir o
            histórico de uma oportunidade e sugerir a próxima ação antes de acionar o GC responsável (ex: risco de
            cancelamento, lead frio, follow-up de proposta parada).
          </p>
          <Link href="/automacoes" className="text-xs font-semibold text-blue hover:underline mt-auto">
            Ver automações →
          </Link>
        </div>
      </div>

      <a
        href="https://platform.claude.com/settings/billing"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs font-semibold text-navy/50 hover:text-blue w-fit"
      >
        <ExternalLink size={12} /> Ver saldo/recarregar no Console Anthropic
      </a>
    </div>
  );
}
