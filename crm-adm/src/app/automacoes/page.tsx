"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, Sparkles, Trash2, Workflow, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Automacao } from "@/lib/types";
import { badgeClasses } from "@/components/Badge";

type ContadorExecucao = { sucessos: number; erros: number };

const EXEMPLO_FOLLOWUP_PADRAO = {
  nome: "Follow-up padrão",
  descricao: "Reaproveita a mesma regra do botão \"Gerar follow-ups\": empresa sem contato há 7 dias vira atividade.",
};

export default function AutomacoesPage() {
  const router = useRouter();
  const [automacoes, setAutomacoes] = useState<Automacao[]>([]);
  const [contadores, setContadores] = useState<Record<string, ContadorExecucao>>({});
  const [sugestoesPendentes, setSugestoesPendentes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("automacoes")
      .select("*")
      .order("criado_em", { ascending: false })
      .then(({ data }) => {
        if (cancelado) return;
        setAutomacoes((data as Automacao[]) ?? []);
        setLoading(false);
      });
    // Contadores reais de execução (sucesso/erro) — dá confiança de que a
    // automação está rodando de verdade, não só existindo no papel.
    supabase
      .from("automacao_execucoes")
      .select("automacao_id, resultado")
      .then(({ data }) => {
        if (cancelado || !data) return;
        const mapa: Record<string, ContadorExecucao> = {};
        for (const linha of data as { automacao_id: string; resultado: string }[]) {
          const atual = mapa[linha.automacao_id] ?? { sucessos: 0, erros: 0 };
          if (linha.resultado === "sucesso") atual.sucessos += 1;
          else if (linha.resultado === "erro") atual.erros += 1;
          mapa[linha.automacao_id] = atual;
        }
        setContadores(mapa);
      });
    supabase
      .from("automacao_sugestoes_ia")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendente")
      .then(({ count }) => {
        if (!cancelado) setSugestoesPendentes(count ?? 0);
      });
    return () => {
      cancelado = true;
    };
  }, [refreshKey]);

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

  async function criarExemploFollowup() {
    setCriando(true);
    const { data: automacao, error } = await supabase
      .from("automacoes")
      .insert({ nome: EXEMPLO_FOLLOWUP_PADRAO.nome, descricao: EXEMPLO_FOLLOWUP_PADRAO.descricao })
      .select("id")
      .single();

    if (error || !automacao) {
      setCriando(false);
      alert("Erro ao criar exemplo: " + (error?.message ?? "desconhecido"));
      return;
    }

    const { data: gatilho } = await supabase
      .from("automacao_nos")
      .insert({
        automacao_id: automacao.id,
        tipo: "gatilho_sem_contato",
        posicao_x: 100,
        posicao_y: 80,
        config: { dias: 7 },
      })
      .select("id")
      .single();

    const { data: acao } = await supabase
      .from("automacao_nos")
      .insert({
        automacao_id: automacao.id,
        tipo: "acao_criar_atividade",
        posicao_x: 100,
        posicao_y: 260,
        config: { tipoAtividade: "Follow-up automático (sem contato)", prazoDias: 0 },
      })
      .select("id")
      .single();

    if (gatilho && acao) {
      await supabase.from("automacao_conexoes").insert({
        automacao_id: automacao.id,
        no_origem_id: gatilho.id,
        no_destino_id: acao.id,
      });
    }

    setCriando(false);
    router.push(`/automacoes/${automacao.id}`);
  }

  async function alternarStatus(automacao: Automacao) {
    const novoStatus = automacao.status === "ativa" ? "rascunho" : "ativa";
    await supabase.from("automacoes").update({ status: novoStatus }).eq("id", automacao.id);
    setRefreshKey((k) => k + 1);
  }

  async function excluir(automacao: Automacao) {
    if (!confirm(`Excluir a automação "${automacao.nome}"? Isso apaga o fluxo e o histórico de execuções dela.`)) return;
    await supabase.from("automacoes").delete().eq("id", automacao.id);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="titulo-pagina flex items-center gap-2">
            <Workflow size={20} /> Automações
          </h1>
          <p className="text-sm text-navy/60">
            Fluxos automáticos de follow-up: WhatsApp, agenda, atividades e nós de IA (mensagem, condição, resumo).
          </p>
        </div>
        <div className="flex gap-2">
          {automacoes.length === 0 && (
            <button onClick={criarExemploFollowup} disabled={criando} className="btn-secondary whitespace-nowrap">
              Criar exemplo &quot;Follow-up padrão&quot;
            </button>
          )}
          <button onClick={criarNova} disabled={criando} className="btn-primary whitespace-nowrap">
            <Plus size={16} /> Nova automação
          </button>
        </div>
      </div>

      {sugestoesPendentes > 0 && (
        <button
          onClick={() => router.push("/automacoes/sugestoes")}
          className="flex items-center gap-2 bg-blue/10 hover:bg-blue/15 text-blue rounded-xl px-4 py-3 text-sm font-semibold text-left transition-colors"
        >
          <Sparkles size={16} className="shrink-0" />
          {sugestoesPendentes} sugestão{sugestoesPendentes > 1 ? "ões" : ""} de IA aguardando revisão
        </button>
      )}

      <div className="bg-white rounded-xl border border-navy/15 overflow-x-auto shadow-sm">
        {loading ? (
          <p className="p-6 text-sm text-navy/50">Carregando...</p>
        ) : automacoes.length === 0 ? (
          <p className="p-6 text-sm text-navy/50">Nenhuma automação criada ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-navy/50 border-b border-navy/15 bg-navy/[0.03]">
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Execuções</th>
                <th className="px-4 py-3 font-semibold">Atualizado em</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {automacoes.map((automacao) => (
                <tr key={automacao.id} className="border-b border-navy/5 last:border-0 hover:bg-navy/[0.02]">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => router.push(`/automacoes/${automacao.id}`)}
                      className="font-semibold text-navy hover:text-blue text-left"
                    >
                      {automacao.nome}
                    </button>
                    {automacao.descricao && <div className="text-xs text-navy/50">{automacao.descricao}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => alternarStatus(automacao)}
                      aria-label={automacao.status === "ativa" ? "Desativar automação" : "Ativar automação"}
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        automacao.status === "ativa" ? badgeClasses("success") : "bg-navy/5 text-navy/50"
                      }`}
                    >
                      {automacao.status === "ativa" ? "Ativa" : "Rascunho"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const c = contadores[automacao.id];
                      if (!c || (c.sucessos === 0 && c.erros === 0)) {
                        return <span className="text-xs text-navy/40">Nunca executou</span>;
                      }
                      return (
                        <div className="flex items-center gap-3 text-xs font-semibold">
                          <span className="flex items-center gap-1 text-success">
                            <CheckCircle2 size={13} /> {c.sucessos}
                          </span>
                          {c.erros > 0 && (
                            <span className="flex items-center gap-1 text-red">
                              <XCircle size={13} /> {c.erros}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-navy/60">
                    {new Date(automacao.atualizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => excluir(automacao)}
                      className="p-2.5 rounded-md hover:bg-red/10 text-red"
                      title="Excluir"
                      aria-label="Excluir automação"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
