"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  CheckCheck,
  Clock,
  Send,
  AlertTriangle,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Mic,
  StickyNote,
  X,
  File as FileIcon,
} from "lucide-react";
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
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false);
  const [notaAberta, setNotaAberta] = useState(false);
  const [notaTexto, setNotaTexto] = useState("");
  const fimDasMensagensRef = useRef<HTMLDivElement>(null);
  const menuAnexoRef = useRef<HTMLDivElement>(null);
  const imagemInputRef = useRef<HTMLInputElement>(null);
  const documentoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

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
    function aoClicarFora(e: MouseEvent) {
      if (menuAnexoRef.current && !menuAnexoRef.current.contains(e.target as Node)) {
        setMenuAnexoAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  async function carregarMensagens() {
    const { data } = await supabase
      .from("whatsapp_mensagens")
      .select("*, gcs(nome)")
      .eq("conversa_id", conversaId)
      .order("criado_em", { ascending: true });
    const lista = (data as unknown as WhatsappMensagem[]) ?? [];
    setMensagens(lista);

    const ultimaRecebida = [...lista].reverse().find((m) => m.direcao === "recebida");
    setDentroDaJanela(
      ultimaRecebida ? Date.now() - new Date(ultimaRecebida.criado_em).getTime() < 24 * 60 * 60 * 1000 : false
    );
  }

  useEffect(() => {
    if (!conversaId) return;
    let cancelado = false;

    supabase
      .from("whatsapp_mensagens")
      .select("*, gcs(nome)")
      .eq("conversa_id", conversaId)
      .order("criado_em", { ascending: true })
      .then(({ data }) => {
        if (cancelado) return;
        const lista = (data as unknown as WhatsappMensagem[]) ?? [];
        setMensagens(lista);
        const ultimaRecebida = [...lista].reverse().find((m) => m.direcao === "recebida");
        setDentroDaJanela(
          ultimaRecebida ? Date.now() - new Date(ultimaRecebida.criado_em).getTime() < 24 * 60 * 60 * 1000 : false
        );
      });
    supabase.from("whatsapp_conversas").update({ nao_lidas: 0 }).eq("id", conversaId).then(() => carregarConversas());

    const intervalo = setInterval(carregarMensagens, 8000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    await carregarMensagens();
    carregarConversas();
  }

  async function enviarArquivo(tipo: "imagem" | "documento" | "audio", file: File) {
    if (!conversaId) return;
    setMenuAnexoAberto(false);
    setEnviando(true);
    setErroEnvio(null);

    const caminho = `${conversaId}/${Date.now()}-${file.name}`;
    const { error: erroUpload } = await supabase.storage.from("whatsapp-media").upload(caminho, file);
    if (erroUpload) {
      setEnviando(false);
      setErroEnvio("Erro ao enviar arquivo: " + erroUpload.message);
      return;
    }
    const { data: pub } = supabase.storage.from("whatsapp-media").getPublicUrl(caminho);

    const res = await fetch("/api/whatsapp/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversaId,
        midia: { tipo, url: pub.publicUrl, nome: file.name },
        gcId: gcAtual?.id,
      }),
    });
    const data = await res.json();
    setEnviando(false);

    if (!res.ok) {
      setErroEnvio(data.error ?? "Erro ao enviar arquivo");
      return;
    }

    await carregarMensagens();
    carregarConversas();
  }

  async function enviarNotaInterna() {
    if (!conversaId || !notaTexto.trim()) return;
    const res = await fetch("/api/whatsapp/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversaId, nota: notaTexto.trim(), gcId: gcAtual?.id }),
    });
    if (res.ok) {
      setNotaTexto("");
      setNotaAberta(false);
      await carregarMensagens();
      carregarConversas();
    }
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
                    {c.empresas?.nome_empresa ?? c.nome_perfil_whatsapp ?? c.telefone}
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
              <div className="font-semibold text-navy">
                {conversaSelecionada.empresas?.nome_empresa ?? conversaSelecionada.nome_perfil_whatsapp ?? "—"}
              </div>
              <div className="text-xs text-navy/50">
                {conversaSelecionada.telefone}
                {conversaSelecionada.empresas?.nome_empresa && conversaSelecionada.nome_perfil_whatsapp && (
                  <> · perfil do WhatsApp: {conversaSelecionada.nome_perfil_whatsapp}</>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2 bg-navy/[0.02]">
              {mensagens.map((m) =>
                m.interna ? (
                  <div key={m.id} className="flex justify-center">
                    <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-amber-50 border border-amber-200 text-amber-900">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 mb-0.5">
                        <StickyNote size={12} /> Nota interna {m.gcs?.nome ? `· ${m.gcs.nome}` : ""}
                      </div>
                      <div className="whitespace-pre-wrap break-words">{m.conteudo}</div>
                      <div className="text-[10px] text-amber-600 mt-1">
                        {new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className={`flex ${m.direcao === "enviada" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${
                        m.direcao === "enviada" ? "bg-blue text-white rounded-br-sm" : "bg-white text-navy border border-navy/10 rounded-bl-sm"
                      }`}
                    >
                      {m.direcao === "enviada" && m.gcs?.nome && (
                        <div className="text-[11px] font-semibold text-white/70 mb-0.5">{m.gcs.nome}</div>
                      )}
                      <ConteudoMensagem mensagem={m} />
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
                )
              )}
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

              <div className="flex gap-2 items-center relative">
                <div ref={menuAnexoRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuAnexoAberto((v) => !v)}
                    disabled={enviando}
                    className="p-2.5 rounded-md hover:bg-navy/5 text-navy/60"
                    title="Anexar"
                  >
                    <Paperclip size={18} />
                  </button>
                  {menuAnexoAberto && (
                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-lg shadow-lg border border-navy/10 overflow-hidden z-10">
                      <button
                        type="button"
                        onClick={() => imagemInputRef.current?.click()}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-navy/70 hover:bg-navy/5"
                      >
                        <ImageIcon size={14} /> Imagem
                      </button>
                      <button
                        type="button"
                        onClick={() => documentoInputRef.current?.click()}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-navy/70 hover:bg-navy/5"
                      >
                        <FileText size={14} /> Documento
                      </button>
                      <button
                        type="button"
                        onClick={() => audioInputRef.current?.click()}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-navy/70 hover:bg-navy/5"
                      >
                        <Mic size={14} /> Áudio
                      </button>
                      <div className="border-t border-navy/5" />
                      <button
                        type="button"
                        onClick={() => {
                          setNotaAberta(true);
                          setMenuAnexoAberto(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
                      >
                        <StickyNote size={14} /> Nota interna
                      </button>
                    </div>
                  )}
                  <input
                    ref={imagemInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) enviarArquivo("imagem", file);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={documentoInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) enviarArquivo("documento", file);
                      e.target.value = "";
                    }}
                  />
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) enviarArquivo("audio", file);
                      e.target.value = "";
                    }}
                  />
                </div>

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

            {notaAberta && (
              <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4" onClick={() => setNotaAberta(false)}>
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-navy flex items-center gap-2">
                      <StickyNote size={16} className="text-amber-600" /> Nota interna
                    </h2>
                    <button onClick={() => setNotaAberta(false)} className="text-navy/40 hover:text-navy">
                      <X size={18} />
                    </button>
                  </div>
                  <p className="text-xs text-navy/50 mb-3">
                    Visível só aqui no CRM, para o time. O cliente nunca recebe isso no WhatsApp.
                  </p>
                  <textarea
                    className="input w-full min-h-[100px] resize-none"
                    placeholder="Ex: cliente pediu desconto, confirmar com o financeiro..."
                    value={notaTexto}
                    onChange={(e) => setNotaTexto(e.target.value)}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 mt-3">
                    <button onClick={() => setNotaAberta(false)} className="btn-secondary">
                      Cancelar
                    </button>
                    <button onClick={enviarNotaInterna} disabled={!notaTexto.trim()} className="btn-primary">
                      Salvar nota
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConteudoMensagem({ mensagem }: { mensagem: WhatsappMensagem }) {
  if (mensagem.tipo === "imagem" && mensagem.midia_url) {
    return (
      <a href={mensagem.midia_url} target="_blank" rel="noopener noreferrer">
        <img src={mensagem.midia_url} alt={mensagem.midia_nome ?? "imagem"} className="rounded-md max-w-full max-h-64 object-contain" />
      </a>
    );
  }
  if (mensagem.tipo === "documento" && mensagem.midia_url) {
    return (
      <a
        href={mensagem.midia_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 underline break-all"
      >
        <FileIcon size={16} className="shrink-0" /> {mensagem.midia_nome ?? "Documento"}
      </a>
    );
  }
  if (mensagem.tipo === "audio" && mensagem.midia_url) {
    return <audio controls src={mensagem.midia_url} className="max-w-full" />;
  }
  return <div className="whitespace-pre-wrap break-words">{mensagem.conteudo}</div>;
}

function StatusIcone({ status }: { status: WhatsappMensagem["status_entrega"] }) {
  if (status === "lido") return <CheckCheck size={12} className="text-blue-300" />;
  if (status === "entregue") return <CheckCheck size={12} />;
  if (status === "enviado") return <Check size={12} />;
  if (status === "falhou") return <AlertTriangle size={12} className="text-red-300" />;
  return <Clock size={12} />;
}
