"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useGcAtual } from "@/lib/useGcAtual";
import type { SugestaoIaAutomacao } from "@/lib/types";

export default function SugestoesIaPage() {
  const { gc: gcAtual } = useGcAtual();
  const [sugestoes, setSugestoes] = useState<SugestaoIaAutomacao[]>([]);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("automacao_sugestoes_ia")
      .select("*, empresas(nome_empresa)")
      .eq("status", "pendente")
      .order("criado_em", { ascending: false })
      .then(({ data }) => {
        if (cancelado) return;
        const lista = (data as SugestaoIaAutomacao[]) ?? [];
        setSugestoes(lista);
        setTextos((prev) => {
          const novo = { ...prev };
          for (const s of lista) if (!(s.id in novo)) novo[s.id] = s.conteudo;
          return novo;
        });
        setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [refreshKey]);

  async function processar(sugestao: SugestaoIaAutomacao, acao: "aprovar" | "descartar") {
    setProcessando(sugestao.id);
    setErro(null);
    const res = await fetch("/api/automacoes/sugestoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sugestaoId: sugestao.id, acao, conteudoEditado: textos[sugestao.id], gcId: gcAtual?.id }),
    });
    const data = await res.json();
    setProcessando(null);
    if (!res.ok) {
      setErro(data.error ?? "Erro ao processar sugestão");
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4">
      <Link href="/automacoes" className="flex items-center gap-1.5 text-sm text-navy/60 hover:text-navy w-fit">
        <ArrowLeft size={15} /> Automações
      </Link>

      <div>
        <h1 className="titulo-pagina flex items-center gap-2">
          <Sparkles size={20} /> Sugestões de IA pendentes
        </h1>
        <p className="text-sm text-navy/60">
          Mensagens geradas por automações com IA, aguardando aprovação antes de sair pro cliente. Edite se quiser antes de aprovar.
        </p>
      </div>

      {erro && <p className="text-sm text-red bg-red/5 rounded-md px-3 py-2">{erro}</p>}

      {loading ? (
        <p className="text-sm text-navy/50">Carregando...</p>
      ) : sugestoes.length === 0 ? (
        <p className="text-sm text-navy/50 bg-white rounded-xl border border-navy/15 p-6 text-center">
          Nenhuma sugestão pendente no momento.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {sugestoes.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-navy/15 shadow-sm p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-navy text-sm">{s.empresas?.nome_empresa ?? "Empresa"}</span>
                  <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue/10 text-blue">
                    {s.canal === "whatsapp" ? "WhatsApp" : "E-mail"}
                  </span>
                </div>
                <span className="text-[11px] text-navy/40">
                  {new Date(s.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {s.canal === "email" && s.assunto && <p className="text-xs text-navy/50">Assunto: {s.assunto}</p>}

              <textarea
                className="input min-h-[100px] resize-none"
                value={textos[s.id] ?? s.conteudo}
                onChange={(e) => setTextos((prev) => ({ ...prev, [s.id]: e.target.value }))}
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => processar(s, "descartar")}
                  disabled={processando === s.id}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold text-red hover:bg-red/5 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 size={13} /> Descartar
                </button>
                <button
                  onClick={() => processar(s, "aprovar")}
                  disabled={processando === s.id}
                  className="btn-primary text-xs"
                >
                  <Check size={13} /> {processando === s.id ? "Enviando..." : "Aprovar e enviar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
