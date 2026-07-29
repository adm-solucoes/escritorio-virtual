"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X, Send, Loader2, AlertTriangle, CalendarCheck, CalendarX, Check, Video } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Gc } from "@/lib/types";

interface PropostaReuniao {
  participanteNome: string | null;
  participantesEmails: string[];
  assunto: string;
  dataISO: string;
  hora: string;
  duracaoMinutos: number;
}

type StatusProposta = "pendente" | "confirmando" | "confirmada" | "cancelada" | "erro";

interface EventoParaCancelar {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  linkEvento: string | null;
}

type StatusItemCancelamento = "pendente" | "cancelando" | "cancelado" | "mantido" | "erro";

interface ItemCancelamento extends EventoParaCancelar {
  status: StatusItemCancelamento;
  erro?: string;
}

interface Mensagem {
  autor: "usuario" | "ia";
  texto?: string;
  erro?: boolean;
  proposta?: PropostaReuniao;
  statusProposta?: StatusProposta;
  detalheProposta?: string; // link do Meet / mensagem de erro, preenchido após confirmar
  cancelamento?: ItemCancelamento[];
}

const PAGINAS_SEM_MENU = ["/login", "/redefinir-senha", "/auth"];

export default function AssistenteComercial() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [gcAtual, setGcAtual] = useState<Gc | null>(null);
  const [pergunta, setPergunta] = useState("");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [enviando, setEnviando] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);

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
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  function abrir() {
    setAberto(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function enviar() {
    const texto = pergunta.trim();
    if (!texto || !gcAtual || enviando) return;
    setMensagens((prev) => [...prev, { autor: "usuario", texto }]);
    setPergunta("");
    setEnviando(true);
    try {
      const res = await fetch("/api/assistente/perguntar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gcId: gcAtual.id, pergunta: texto }),
      });
      const dados = await res.json();
      if (dados.propostaReuniao) {
        setMensagens((prev) => [...prev, { autor: "ia", proposta: dados.propostaReuniao, statusProposta: "pendente" }]);
      } else if (dados.propostaCancelamento) {
        const eventos: EventoParaCancelar[] = dados.propostaCancelamento.eventos;
        setMensagens((prev) => [
          ...prev,
          { autor: "ia", cancelamento: eventos.map((e) => ({ ...e, status: "pendente" as const })) },
        ]);
      } else if (dados.resposta) {
        setMensagens((prev) => [...prev, { autor: "ia", texto: dados.resposta }]);
      } else {
        setMensagens((prev) => [
          ...prev,
          { autor: "ia", texto: dados.error ?? "Não consegui responder agora.", erro: true },
        ]);
      }
    } catch {
      setMensagens((prev) => [...prev, { autor: "ia", texto: "Erro de rede ao consultar a IA.", erro: true }]);
    }
    setEnviando(false);
  }

  // `participantesEmailsAtuais` vem direto do card (não do estado
  // `mensagens`) porque setMensagens é assíncrono — se o usuário editar o
  // campo e clicar "Confirmar" na sequência, ler de `mensagens` pegaria o
  // valor de ANTES da edição (batch do React ainda não aplicado).
  async function confirmarReuniao(indice: number, participantesEmailsAtuais: string[]) {
    const alvo = mensagens[indice];
    if (!alvo.proposta || !gcAtual) return;

    setMensagens((prev) => prev.map((m, i) => (i === indice ? { ...m, statusProposta: "confirmando" } : m)));

    try {
      const res = await fetch("/api/assistente/confirmar-reuniao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gcId: gcAtual.id, ...alvo.proposta, participantesEmails: participantesEmailsAtuais }),
      });
      const dados = await res.json();
      setMensagens((prev) =>
        prev.map((m, i) =>
          i === indice
            ? {
                ...m,
                statusProposta: res.ok ? "confirmada" : "erro",
                detalheProposta: res.ok
                  ? `${dados.dataHoraFormatada}${dados.linkChamada ? ` · ${dados.linkChamada}` : ""}`
                  : dados.error ?? "Não consegui marcar a reunião.",
              }
            : m
        )
      );
    } catch {
      setMensagens((prev) =>
        prev.map((m, i) => (i === indice ? { ...m, statusProposta: "erro", detalheProposta: "Erro de rede." } : m))
      );
    }
  }

  function cancelarProposta(indice: number) {
    setMensagens((prev) => prev.map((m, i) => (i === indice ? { ...m, statusProposta: "cancelada" } : m)));
  }

  function editarEmailsProposta(indice: number, emails: string[]) {
    setMensagens((prev) =>
      prev.map((m, i) => (i === indice && m.proposta ? { ...m, proposta: { ...m.proposta, participantesEmails: emails } } : m))
    );
  }

  function atualizarItemCancelamento(indiceMsg: number, eventoId: string, patch: Partial<ItemCancelamento>) {
    setMensagens((prev) =>
      prev.map((m, i) =>
        i === indiceMsg && m.cancelamento
          ? { ...m, cancelamento: m.cancelamento.map((e) => (e.id === eventoId ? { ...e, ...patch } : e)) }
          : m
      )
    );
  }

  function manterEvento(indiceMsg: number, eventoId: string) {
    atualizarItemCancelamento(indiceMsg, eventoId, { status: "mantido" });
  }

  async function confirmarCancelamento(indiceMsg: number, eventoId: string) {
    if (!gcAtual) return;
    atualizarItemCancelamento(indiceMsg, eventoId, { status: "cancelando" });
    try {
      const res = await fetch("/api/assistente/cancelar-reuniao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gcId: gcAtual.id, eventoId }),
      });
      const dados = await res.json();
      atualizarItemCancelamento(indiceMsg, eventoId, {
        status: res.ok ? "cancelado" : "erro",
        erro: res.ok ? undefined : dados.error ?? "Não consegui cancelar.",
      });
    } catch {
      atualizarItemCancelamento(indiceMsg, eventoId, { status: "erro", erro: "Erro de rede." });
    }
  }

  if (esconderNaPagina || gcAtual?.role === "sem_acesso") return null;

  return (
    <>
      <button
        onClick={abrir}
        className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-blue text-white shadow-lg flex items-center justify-center hover:bg-blue/90 transition-colors"
        title="Assistente comercial (IA)"
      >
        <Sparkles size={20} />
      </button>

      {aberto && (
        <div className="fixed inset-0 z-[60] bg-navy/40 flex items-end sm:items-start justify-center sm:justify-end p-4 sm:pt-20 sm:pr-5" onClick={() => setAberto(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md h-[70vh] sm:h-[520px] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-navy/10 shrink-0">
              <div className="flex items-center gap-2 text-sm font-bold text-navy">
                <Sparkles size={15} className="text-blue" /> Assistente comercial
              </div>
              <button onClick={() => setAberto(false)} className="text-navy/40 hover:text-navy">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {mensagens.length === 0 && (
                <p className="text-xs text-navy/40">
                  Pergunte sobre empresas, oportunidades e pipeline, peça pra marcar ou cancelar uma reunião — ex:
                  &quot;quais oportunidades estão paradas há mais tempo?&quot;, &quot;marca uma call com o Caio amanhã
                  às 14h&quot; ou &quot;cancela a reunião de sexta&quot;.
                </p>
              )}
              {mensagens.map((m, i) =>
                m.proposta ? (
                  <PropostaReuniaoCard
                    key={i}
                    proposta={m.proposta}
                    status={m.statusProposta ?? "pendente"}
                    detalhe={m.detalheProposta}
                    onConfirmar={(emails) => confirmarReuniao(i, emails)}
                    onCancelar={() => cancelarProposta(i)}
                    onEditarEmails={(emails) => editarEmailsProposta(i, emails)}
                  />
                ) : m.cancelamento ? (
                  <PropostaCancelamentoCard
                    key={i}
                    eventos={m.cancelamento}
                    onCancelar={(eventoId) => confirmarCancelamento(i, eventoId)}
                    onManter={(eventoId) => manterEvento(i, eventoId)}
                  />
                ) : (
                  <div
                    key={i}
                    className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${
                      m.autor === "usuario"
                        ? "self-end bg-blue/10 text-navy"
                        : m.erro
                        ? "self-start bg-red/10 text-red flex items-start gap-1.5"
                        : "self-start bg-navy/[0.04] text-navy"
                    }`}
                  >
                    {m.erro && <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
                    <span className="whitespace-pre-wrap">{m.texto}</span>
                  </div>
                )
              )}
              {enviando && (
                <div className="self-start flex items-center gap-1.5 text-xs text-navy/40">
                  <Loader2 size={12} className="animate-spin" /> Consultando...
                </div>
              )}
              <div ref={fimRef} />
            </div>

            <div className="p-3 border-t border-navy/10 flex gap-2 shrink-0">
              <input
                ref={inputRef}
                className="input flex-1"
                placeholder="Pergunte algo sobre o comercial..."
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") enviar();
                }}
              />
              <button onClick={enviar} disabled={!pergunta.trim() || enviando} className="btn-primary px-3">
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PropostaReuniaoCard({
  proposta,
  status,
  detalhe,
  onConfirmar,
  onCancelar,
  onEditarEmails,
}: {
  proposta: PropostaReuniao;
  status: StatusProposta;
  detalhe?: string;
  onConfirmar: (emails: string[]) => void;
  onCancelar: () => void;
  onEditarEmails: (emails: string[]) => void;
}) {
  const [textoEmails, setTextoEmails] = useState(proposta.participantesEmails.join(", "));

  const dataFormatada = new Date(`${proposta.dataISO}T${proposta.hora}:00-03:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

  function emailsAtuais(): string[] {
    return textoEmails
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
  }

  return (
    <div className="self-start max-w-[90%] rounded-lg border border-blue/20 bg-blue/5 px-3 py-2.5 text-sm text-navy">
      <div className="flex items-center gap-1.5 text-xs font-bold text-blue mb-1.5">
        <CalendarCheck size={14} /> Proposta de reunião
      </div>
      <p className="font-semibold">{proposta.assunto}</p>
      <p className="text-xs text-navy/60 mt-0.5">
        {dataFormatada} às {proposta.hora} · {proposta.duracaoMinutos}min
        {proposta.participanteNome ? ` · com ${proposta.participanteNome}` : ""}
      </p>

      {status === "pendente" && (
        <div className="mt-2">
          <label className="text-[11px] font-semibold text-navy/50 uppercase tracking-wide">
            E-mail(s) do(s) convidado(s) — opcional
          </label>
          <input
            className="input text-xs mt-1 w-full"
            placeholder="fulano@empresa.com, ciclano@empresa.com"
            value={textoEmails}
            onChange={(e) => setTextoEmails(e.target.value)}
            onBlur={() => onEditarEmails(emailsAtuais())}
          />
        </div>
      )}

      {status === "pendente" && (
        <div className="flex gap-2 mt-2.5">
          <button onClick={onCancelar} className="px-2.5 py-1 rounded-md text-xs font-semibold text-navy/60 hover:bg-navy/5">
            Cancelar
          </button>
          <button onClick={() => onConfirmar(emailsAtuais())} className="btn-primary text-xs px-2.5 py-1">
            <Check size={13} /> Confirmar
          </button>
        </div>
      )}
      {status === "confirmando" && (
        <div className="flex items-center gap-1.5 text-xs text-navy/50 mt-2">
          <Loader2 size={12} className="animate-spin" /> Marcando na sua agenda...
        </div>
      )}
      {status === "confirmada" && (
        <div className="flex items-start gap-1.5 text-xs text-green-700 mt-2 bg-green-50 rounded-md px-2 py-1.5">
          <Video size={13} className="shrink-0 mt-0.5" />
          <span>Marcado! {detalhe}</span>
        </div>
      )}
      {status === "cancelada" && <p className="text-xs text-navy/40 mt-2">Não marcado.</p>}
      {status === "erro" && (
        <div className="flex items-start gap-1.5 text-xs text-red mt-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>{detalhe}</span>
        </div>
      )}
    </div>
  );
}

function PropostaCancelamentoCard({
  eventos,
  onCancelar,
  onManter,
}: {
  eventos: ItemCancelamento[];
  onCancelar: (eventoId: string) => void;
  onManter: (eventoId: string) => void;
}) {
  return (
    <div className="self-start max-w-[90%] rounded-lg border border-red/20 bg-red/5 px-3 py-2.5 text-sm text-navy flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5 text-xs font-bold text-red">
        <CalendarX size={14} />
        {eventos.length > 1 ? "Qual dessas reuniões você quer cancelar?" : "Cancelar esta reunião?"}
      </div>

      {eventos.map((evento) => {
        const inicio = new Date(evento.inicio);
        const dataFormatada = inicio.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
        const hora = inicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

        return (
          <div key={evento.id} className="border-t border-red/10 pt-2 first:border-t-0 first:pt-0">
            <p className="font-semibold text-xs">{evento.titulo}</p>
            <p className="text-xs text-navy/60 mt-0.5">
              {dataFormatada} às {hora}
            </p>

            {evento.status === "pendente" && (
              <div className="flex gap-2 mt-1.5">
                <button
                  onClick={() => onManter(evento.id)}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold text-navy/60 hover:bg-navy/5"
                >
                  Manter
                </button>
                <button
                  onClick={() => onCancelar(evento.id)}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red text-white hover:bg-red/90 flex items-center gap-1"
                >
                  <CalendarX size={12} /> Cancelar
                </button>
              </div>
            )}
            {evento.status === "cancelando" && (
              <div className="flex items-center gap-1.5 text-xs text-navy/50 mt-1.5">
                <Loader2 size={12} className="animate-spin" /> Cancelando...
              </div>
            )}
            {evento.status === "cancelado" && (
              <p className="text-xs text-green-700 mt-1.5 bg-green-50 rounded-md px-2 py-1 inline-block">Cancelada.</p>
            )}
            {evento.status === "mantido" && <p className="text-xs text-navy/40 mt-1.5">Mantida, nada mudou.</p>}
            {evento.status === "erro" && (
              <div className="flex items-start gap-1.5 text-xs text-red mt-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>{evento.erro}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
