"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CheckCheck, Clock, Send, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Gc, WhatsappConversa, WhatsappMensagem } from "@/lib/types";

interface Template {
  name: string;
  language: string;
  status: string;
}

export default function WhatsappPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-navy/50">Carregando...</p>}>
      <WhatsappPageConteudo />
    </Suspense>
  );
}

function WhatsappPageConteudo() {
  const searchParams = useSearchParams();
  const [conversas, setConversas] = useState<WhatsappConversa[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(() => searchParams.get("conversa"));
  const [mensagens, setMensagens] = useState<WhatsappMensagem[]>([]);
  const [gcAtual, setGcAtual] = useState<Gc | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [dentroDaJanela, setDentroDaJanela] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateEscolhido, setTemplateEscolhido] = useState("");
  const [loading, setLoading] = useState(true);
  const fimDasMensagensRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    async function carregarUsuario() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelado || !user?.email) return;
      const { data: gc } = await supabase.from("gcs").select("*").eq("email", user.email).maybeSingle();
      if (!cancelado) setGcAtual(gc ?? null);
    }
    carregarUsuario();
    return () => {
      cancelado = true;
    };
  }, []);

  async function carregarConversas() {
    const { data } = await supabase
      .from("whatsapp_conversas")
      .select("*, empresas(nome_empresa, telefone)")
      .order("ultima_mensagem_em", { ascending: false, nullsFirst: false });
    setConversas((data as unknown as WhatsappConversa[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("whatsapp_conversas")
      .select("*, empresas(nome_empresa, telefone)")
      .order("ultima_mensagem_em", { ascending: false, nullsFirst: false })
      .then(({ data }) => {
        if (cancelado) return;
        setConversas((data as unknown as WhatsappConversa[]) ?? []);
        setLoading(false);
      });
    const intervalo = setInterval(carregarConversas, 15000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
     
  }, []);

  useEffect(() => {
    if (!conversaId) return;
    let cancelado = false;

    async function carregarMensagens() {
      const { data } = await supabase
        .from("whatsapp_mensagens")
        .select("*")
        .eq("conversa_id", conversaId)
        .order("criado_em", { ascending: true });
      if (cancelado) return;
      const lista = (data as WhatsappMensagem[]) ?? [];
      setMensagens(lista);

      const ultimaRecebida = [...lista].reverse().find((m) => m.direcao === "recebida");
      setDentroDaJanela(
        ultimaRecebida ? Date.now() - new Date(ultimaRecebida.criado_em).getTime() < 24 * 60 * 60 * 1000 : false
      );
    }

    carregarMensagens();
    supabase.from("whatsapp_conversas").update({ nao_lidas: 0 }).eq("id", conversaId).then(() => carregarConversas());

    const intervalo = setInterval(carregarMensagens, 8000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
     
  }, [conversaId]);

  useEffect(() => {
    fimDasMensagensRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  useEffect(() => {
    fetch("/api/whatsapp/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]));
  }, []);

  const conversaSelecionada = useMemo(() => conversas.find((c) => c.id === conversaId), [conversas, conversaId]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!conversaId) return;
    if (!dentroDaJanela && !templateEscolhido) {
      setErroEnvio("Selecione um template — a janela de 24h dessa conversa está fechada.");
      return;
    }
    if (dentroDaJanela && !texto.trim()) return;

    setEnviando(true);
    setErroEnvio(null);

    const payload = dentroDaJanela && !templateEscolhido
      ? { conversaId, texto: texto.trim(), gcId: gcAtual?.id }
      : { conversaId, template: { nome: templateEscolhido, idioma: "pt_BR" }, gcId: gcAtual?.id };

    const res = await fetch("/api/whatsapp/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setEnviando(false);

    if (!res.ok) {
      setErroEnvio(data.error ?? "Erro ao enviar mensagem");
      return;
    }

    setTexto("");
    setTemplateEscolhido("");
    const { data: novasMensagens } = await supabase
      .from("whatsapp_mensagens")
      .select("*")
      .eq("conversa_id", conversaId)
      .order("criado_em", { ascending: true });
    setMensagens((novasMensagens as WhatsappMensagem[]) ?? []);
    carregarConversas();
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-72 shrink-0 border-r border-navy/10 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-navy/10">
          <h1 className="text-lg font-extrabold text-navy">WhatsApp</h1>
          <p className="text-xs text-navy/50">{conversas.length} conversas</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-navy/50">Carregando...</p>
          ) : conversas.length === 0 ? (
            <p className="p-4 text-sm text-navy/50">Nenhuma conversa ainda.</p>
          ) : (
            conversas.map((c) => (
              <button
                key={c.id}
                onClick={() => setConversaId(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-navy/5 hover:bg-navy/[0.03] transition-colors ${
                  conversaId === c.id ? "bg-blue/10" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-navy truncate">
                    {c.empresas?.nome_empresa ?? c.telefone}
                  </span>
                  {c.nao_lidas > 0 && (
                    <span className="shrink-0 bg-red text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {c.nao_lidas}
                    </span>
                  )}
                </div>
                <div className="text-xs text-navy/50 truncate">{c.telefone}</div>
                {c.ultima_mensagem_em && (
                  <div className="text-[11px] text-navy/40 mt-0.5">
                    {new Date(c.ultima_mensagem_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {!conversaSelecionada ? (
          <div className="flex-1 flex items-center justify-center text-navy/40 text-sm">
            Selecione uma conversa à esquerda
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-navy/10 bg-white">
              <div className="font-semibold text-navy">{conversaSelecionada.empresas?.nome_empresa ?? "—"}</div>
              <div className="text-xs text-navy/50">{conversaSelecionada.telefone}</div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2 bg-navy/[0.02]">
              {mensagens.map((m) => (
                <div key={m.id} className={`flex ${m.direcao === "enviada" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${
                      m.direcao === "enviada" ? "bg-blue text-white rounded-br-sm" : "bg-white text-navy border border-navy/10 rounded-bl-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.conteudo}</div>
                    <div
                      className={`flex items-center gap-1 justify-end mt-1 text-[10px] ${
                        m.direcao === "enviada" ? "text-white/70" : "text-navy/40"
                      }`}
                    >
                      {new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {m.direcao === "enviada" && <StatusIcone status={m.status_entrega} />}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={fimDasMensagensRef} />
            </div>

            <form onSubmit={enviar} className="border-t border-navy/10 bg-white p-3 flex flex-col gap-2">
              {!dentroDaJanela && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-md px-2.5 py-1.5">
                  <AlertTriangle size={13} />
                  Fora da janela de 24h — escolha um template pra iniciar a conversa de novo.
                </div>
              )}

              {!dentroDaJanela ? (
                <select className="input" value={templateEscolhido} onChange={(e) => setTemplateEscolhido(e.target.value)}>
                  <option value="">Selecione um template...</option>
                  {templates.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : null}

              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder={dentroDaJanela ? "Digite uma mensagem..." : "Envie um template pra reabrir a conversa"}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  disabled={!dentroDaJanela}
                />
                <button type="submit" disabled={enviando} className="btn-primary">
                  <Send size={15} /> {enviando ? "Enviando..." : "Enviar"}
                </button>
              </div>

              {erroEnvio && <p className="text-xs text-red">{erroEnvio}</p>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function StatusIcone({ status }: { status: WhatsappMensagem["status_entrega"] }) {
  if (status === "lido") return <CheckCheck size={12} className="text-blue-300" />;
  if (status === "entregue") return <CheckCheck size={12} />;
  if (status === "enviado") return <Check size={12} />;
  if (status === "falhou") return <AlertTriangle size={12} className="text-red-300" />;
  return <Clock size={12} />;
}
