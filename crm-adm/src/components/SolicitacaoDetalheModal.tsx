"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useGcAtual } from "@/lib/useGcAtual";
import type { Gc, Solicitacao, SolicitacaoMensagem, StatusSolicitacao } from "@/lib/types";

interface Props {
  solicitacao: Solicitacao;
  gcs: Gc[];
  onClose: () => void;
  onStatusChanged: (status: StatusSolicitacao) => void;
}

const STATUS_OPCOES: StatusSolicitacao[] = ["Pendente", "Em andamento", "Atendida", "Recusada"];

const STATUS_CORES: Record<string, string> = {
  Pendente: "bg-amber-100 text-amber-700",
  "Em andamento": "bg-blue/10 text-blue",
  Atendida: "bg-green-100 text-green-700",
  Recusada: "bg-red/10 text-red",
};

function linha(label: string, valor: string | null | undefined) {
  if (!valor) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-navy/40 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-navy/80">{valor}</p>
    </div>
  );
}

/** Chat entre todos os envolvidos numa solicitação — quem pediu, o(s)
 * gestor(es) da área e qualquer outro GC que entrar na conversa. Qualquer
 * membro autenticado lê e escreve (RLS já garante que só quem tem sessão
 * real chega aqui). */
export default function SolicitacaoDetalheModal({ solicitacao, gcs, onClose, onStatusChanged }: Props) {
  const { gc: gcAtual } = useGcAtual();
  const [status, setStatus] = useState<StatusSolicitacao>(solicitacao.status);
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [mensagens, setMensagens] = useState<SolicitacaoMensagem[]>([]);
  const [carregandoChat, setCarregandoChat] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimDoChatRef = useRef<HTMLDivElement>(null);

  const responsavel = gcs.find((g) => g.id === solicitacao.responsavel_solicitacao_id);

  function carregarMensagens() {
    supabase
      .from("solicitacao_mensagens")
      .select("*, gcs(nome, foto_url)")
      .eq("solicitacao_id", solicitacao.id)
      .order("criado_em", { ascending: true })
      .then(({ data }) => {
        setMensagens((data as unknown as SolicitacaoMensagem[]) ?? []);
        setCarregandoChat(false);
      });
  }

  useEffect(() => {
    carregarMensagens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitacao.id]);

  useEffect(() => {
    fimDoChatRef.current?.scrollIntoView({ block: "nearest" });
  }, [mensagens]);

  async function alterarStatus(novoStatus: StatusSolicitacao) {
    setSalvandoStatus(true);
    const patch: { status: StatusSolicitacao; data_resposta?: string } = { status: novoStatus };
    if (novoStatus !== "Pendente" && !solicitacao.data_resposta) {
      patch.data_resposta = new Date().toISOString();
    }
    const { error } = await supabase.from("solicitacoes").update(patch).eq("id", solicitacao.id);
    setSalvandoStatus(false);
    if (error) {
      alert("Erro ao atualizar status: " + error.message);
      return;
    }
    setStatus(novoStatus);
    onStatusChanged(novoStatus);
  }

  async function enviarMensagem(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() || !gcAtual) return;
    setEnviando(true);
    const { error } = await supabase.from("solicitacao_mensagens").insert({
      solicitacao_id: solicitacao.id,
      autor_gc_id: gcAtual.id,
      mensagem: texto.trim(),
    });
    setEnviando(false);
    if (error) {
      alert("Erro ao enviar mensagem: " + error.message);
      return;
    }
    setTexto("");
    carregarMensagens();
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy/15 shrink-0">
          <div className="min-w-0">
            <h2 className="font-extrabold text-lg text-navy truncate">{solicitacao.nome_evento_projeto}</h2>
            <p className="text-xs text-navy/50">
              {solicitacao.area ?? "Sem área definida"} · pedido em{" "}
              {new Date(solicitacao.data_solicitacao).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-navy/5 text-navy/60 shrink-0" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-4 flex flex-col gap-4 border-b border-navy/15">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-navy/40 uppercase tracking-wide">Status</span>
            <select
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer ${STATUS_CORES[status] ?? ""}`}
              value={status}
              disabled={salvandoStatus}
              onChange={(e) => alterarStatus(e.target.value as StatusSolicitacao)}
            >
              {STATUS_OPCOES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {linha("Objetivo", solicitacao.objetivo)}
            {linha("Justificativa", solicitacao.justificativa)}
            {linha("Recursos necessários", solicitacao.recursos_necessarios)}
            {linha("Solicitado por", responsavel?.nome)}
            {linha("Notificado", solicitacao.email_responsavel_atendimento)}
            {linha("Data do evento", solicitacao.data_evento ? new Date(solicitacao.data_evento).toLocaleDateString("pt-BR") : null)}
            {linha("Prazo", solicitacao.prazo ? new Date(solicitacao.prazo).toLocaleDateString("pt-BR") : null)}
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-[180px] overflow-y-auto px-6 py-4 flex flex-col gap-3">
            {carregandoChat ? (
              <p className="text-xs text-navy/40">Carregando conversa...</p>
            ) : mensagens.length === 0 ? (
              <p className="text-xs text-navy/40">
                Nenhuma mensagem ainda — use aqui pra combinar detalhes com quem vai atender.
              </p>
            ) : (
              mensagens.map((m) => {
                const souEu = m.autor_gc_id === gcAtual?.id;
                return (
                  <div key={m.id} className={`flex flex-col ${souEu ? "items-end" : "items-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                        souEu ? "bg-navy text-cream" : "bg-navy/[0.05] text-navy"
                      }`}
                    >
                      {!souEu && <p className="text-[11px] font-semibold text-navy/50 mb-0.5">{m.gcs?.nome ?? "Alguém"}</p>}
                      <p className="whitespace-pre-wrap break-words">{m.mensagem}</p>
                    </div>
                    <span className="text-[10px] text-navy/35 mt-0.5">
                      {new Date(m.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={fimDoChatRef} />
          </div>

          <form onSubmit={enviarMensagem} className="flex items-center gap-2 px-6 py-3 border-t border-navy/15 shrink-0">
            <input
              className="input flex-1"
              placeholder="Escrever mensagem..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <button type="submit" disabled={enviando || !texto.trim()} className="btn-primary shrink-0">
              <Send size={14} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
