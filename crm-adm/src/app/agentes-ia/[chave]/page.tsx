"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Save, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface AgenteIA {
  chave: string;
  nome: string;
  instrucoes_extra: string;
  usar_emojis: boolean;
}

export default function EditarAgenteIaPage({ params }: { params: Promise<{ chave: string }> }) {
  const { chave } = use(params);

  const [agente, setAgente] = useState<AgenteIA | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("agentes_ia")
      .select("chave, nome, instrucoes_extra, usar_emojis")
      .eq("chave", chave)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) {
          setErroCarregar(
            error.message.includes("does not exist")
              ? "A tabela agentes_ia ainda não existe — rode a migration sql/033_agentes_ia.sql no Supabase."
              : error.message
          );
        } else if (!data) {
          setErroCarregar("Agente não encontrado.");
        } else {
          setAgente(data as AgenteIA);
        }
        setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [chave]);

  async function salvar() {
    if (!agente) return;
    setSalvando(true);
    setMensagem(null);
    const { error } = await supabase
      .from("agentes_ia")
      .update({
        nome: agente.nome,
        instrucoes_extra: agente.instrucoes_extra,
        usar_emojis: agente.usar_emojis,
        atualizado_em: new Date().toISOString(),
      })
      .eq("chave", chave);
    setSalvando(false);
    setMensagem(error ? `Erro ao salvar: ${error.message}` : "Salvo.");
  }

  const ehVoz = chave === "agente-voz";

  return (
    <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4">
      <Link href="/agentes-ia" className="flex items-center gap-1.5 text-sm text-navy/50 hover:text-navy w-fit">
        <ArrowLeft size={14} /> Agentes de IA
      </Link>

      {carregando ? (
        <p className="text-sm text-navy/50">Carregando...</p>
      ) : erroCarregar ? (
        <div className="flex items-start gap-2 text-sm text-red bg-red/5 border border-red/20 rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{erroCarregar}</span>
        </div>
      ) : agente ? (
        <>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-navy/5 flex items-center justify-center shrink-0">
              <Bot size={18} className="text-navy" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-navy">Editar {agente.nome}</h1>
              <p className="text-sm text-navy/60">
                {ehVoz ? "Agente de voz outbound (ligações de prospecção)" : "Assistente comercial (chat do CRM)"}
              </p>
            </div>
          </div>

          {ehVoz && (
            <div className="text-xs text-navy/60 bg-navy/[0.03] border border-navy/10 rounded-lg px-4 py-3">
              O agente de voz roda num serviço separado (fora deste CRM). O que você salvar aqui fica guardado, mas
              pra valer numa ligação de verdade ainda precisa de um passo extra de integração naquele serviço —
              ainda não feito.
            </div>
          )}

          <div className="bg-white rounded-xl border border-navy/10 shadow-sm p-5 flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-navy/50 uppercase tracking-wide">Nome</label>
              <input
                className="input mt-1 w-full"
                value={agente.nome}
                onChange={(e) => setAgente({ ...agente, nome: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-navy/50 uppercase tracking-wide">Instrução adicional</label>
              <p className="text-xs text-navy/50 mb-1">
                Some ao comportamento padrão do agente — não substitui as regras de segurança nem o que ele já sabe
                fazer (agendar reunião, consultar dados, etc.).
              </p>
              <textarea
                className="input mt-1 w-full min-h-32 font-mono text-xs"
                value={agente.instrucoes_extra}
                onChange={(e) => setAgente({ ...agente, instrucoes_extra: e.target.value })}
                placeholder="Ex: Sempre que falar de prazo, deixe claro que é uma estimativa..."
              />
            </div>

            {!ehVoz && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={agente.usar_emojis}
                  onChange={(e) => setAgente({ ...agente, usar_emojis: e.target.checked })}
                />
                <span className="text-navy/80">Usar emoji nas respostas</span>
              </label>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button onClick={salvar} disabled={salvando} className="btn-primary text-sm disabled:opacity-50">
                <Save size={14} />
                {salvando ? "Salvando..." : "Salvar"}
              </button>
              {mensagem && <span className="text-xs text-navy/60">{mensagem}</span>}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
