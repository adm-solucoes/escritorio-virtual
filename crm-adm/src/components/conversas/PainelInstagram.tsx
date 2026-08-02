"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Clock, Send, AlertTriangle, Paperclip, Image as ImageIcon, Video as VideoIcon, Link2, Unlink, ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Gc, InstagramConversa, InstagramMensagem } from "@/lib/types";
import { linkInstagram, vincularEmpresaConversaInstagram } from "@/lib/instagram";
import Avatar from "@/components/Avatar";
import CanalBadge from "@/components/CanalBadge";
import { NotaInternaBubble, NotaInternaMenuItem, NotaInternaModal } from "@/components/NotaInterna";

interface Props {
  conversa: InstagramConversa;
  gcAtual: Gc | null;
  onVoltarMobile: () => void;
  onConversaAtualizada: () => void;
  onAbrirSeletorEmpresa: () => void;
}

export default function PainelInstagram({ conversa, gcAtual, onVoltarMobile, onConversaAtualizada, onAbrirSeletorEmpresa }: Props) {
  const [mensagens, setMensagens] = useState<InstagramMensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [dentroDaJanela, setDentroDaJanela] = useState(true);
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false);
  const [notaAberta, setNotaAberta] = useState(false);
  const [notaTexto, setNotaTexto] = useState("");
  const fimDasMensagensRef = useRef<HTMLDivElement>(null);
  const menuAnexoRef = useRef<HTMLDivElement>(null);
  const imagemInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  async function carregarMensagens() {
    const { data } = await supabase
      .from("instagram_mensagens")
      .select("*, gcs(nome, foto_url)")
      .eq("conversa_id", conversa.id)
      .order("criado_em", { ascending: true });
    const lista = (data as unknown as InstagramMensagem[]) ?? [];
    setMensagens(lista);
    const ultimaRecebida = [...lista].reverse().find((m) => m.direcao === "recebida");
    setDentroDaJanela(ultimaRecebida ? Date.now() - new Date(ultimaRecebida.criado_em).getTime() < 24 * 60 * 60 * 1000 : false);
  }

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("instagram_mensagens")
      .select("*, gcs(nome, foto_url)")
      .eq("conversa_id", conversa.id)
      .order("criado_em", { ascending: true })
      .then(({ data }) => {
        if (cancelado) return;
        const lista = (data as unknown as InstagramMensagem[]) ?? [];
        setMensagens(lista);
        const ultimaRecebida = [...lista].reverse().find((m) => m.direcao === "recebida");
        setDentroDaJanela(ultimaRecebida ? Date.now() - new Date(ultimaRecebida.criado_em).getTime() < 24 * 60 * 60 * 1000 : false);
      });
    supabase.from("instagram_conversas").update({ nao_lidas: 0 }).eq("id", conversa.id).then(() => onConversaAtualizada());

    const intervalo = setInterval(carregarMensagens, 8000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa.id]);

  useEffect(() => {
    fimDasMensagensRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (menuAnexoRef.current && !menuAnexoRef.current.contains(e.target as Node)) {
        setMenuAnexoAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  async function desvincular() {
    await vincularEmpresaConversaInstagram(conversa.id, null);
    onConversaAtualizada();
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    setErroEnvio(null);
    const res = await fetch("/api/instagram/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversaId: conversa.id, texto: texto.trim(), gcId: gcAtual?.id }),
    });
    const data = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setErroEnvio(data.error ?? "Erro ao enviar mensagem");
      return;
    }
    setTexto("");
    await carregarMensagens();
    onConversaAtualizada();
  }

  async function enviarArquivo(tipo: "imagem" | "video", file: File) {
    setMenuAnexoAberto(false);
    setEnviando(true);
    setErroEnvio(null);
    const caminho = `${conversa.id}/${Date.now()}-${file.name}`;
    const { error: erroUpload } = await supabase.storage.from("instagram-media").upload(caminho, file);
    if (erroUpload) {
      setEnviando(false);
      setErroEnvio("Erro ao enviar arquivo: " + erroUpload.message);
      return;
    }
    const { data: pub } = supabase.storage.from("instagram-media").getPublicUrl(caminho);
    const res = await fetch("/api/instagram/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversaId: conversa.id, midia: { tipo, url: pub.publicUrl, nome: file.name }, gcId: gcAtual?.id }),
    });
    const data = await res.json();
    setEnviando(false);
    if (!res.ok) {
      setErroEnvio(data.error ?? "Erro ao enviar arquivo");
      return;
    }
    await carregarMensagens();
    onConversaAtualizada();
  }

  async function enviarNotaInterna() {
    if (!notaTexto.trim()) return;
    const res = await fetch("/api/instagram/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversaId: conversa.id, nota: notaTexto.trim(), gcId: gcAtual?.id }),
    });
    if (res.ok) {
      setNotaTexto("");
      setNotaAberta(false);
      await carregarMensagens();
      onConversaAtualizada();
    }
  }

  const nomeContato = conversa.empresas?.nome_empresa ?? conversa.nome_perfil ?? conversa.username ?? "—";

  return (
    <>
      <div className="px-5 py-3 border-b border-navy/15 bg-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onVoltarMobile}
            className="md:hidden -ml-1.5 p-2.5 rounded-md hover:bg-navy/5 text-navy/60 shrink-0"
            title="Voltar pra lista de conversas"
            aria-label="Voltar pra lista de conversas"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="relative shrink-0">
            <Avatar nome={nomeContato} fotoUrl={conversa.foto_perfil_url} tamanho="md" />
            <CanalBadge canal="instagram" tamanho="sm" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-navy truncate">{conversa.empresas?.nome_empresa ?? conversa.nome_perfil ?? "—"}</div>
            <div className="text-xs text-navy/50 truncate">
              {conversa.username ? (
                <a href={linkInstagram(conversa.username) ?? "#"} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  @{conversa.username}
                </a>
              ) : (
                "sem @usuário"
              )}
            </div>
          </div>
        </div>
        {conversa.empresa_id ? (
          <button onClick={desvincular} className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-navy/50 hover:text-red px-2 py-1.5 rounded-md hover:bg-red/5">
            <Unlink size={13} /> Desvincular
          </button>
        ) : (
          <button onClick={onAbrirSeletorEmpresa} className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-blue hover:bg-blue/10 px-2 py-1.5 rounded-md">
            <Link2 size={13} /> Vincular empresa
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2 bg-navy/[0.02]">
        {mensagens.map((m) =>
          m.interna ? (
            <NotaInternaBubble key={m.id} autor={m.gcs?.nome} conteudo={m.conteudo} criadoEm={m.criado_em} />
          ) : (
            <div key={m.id} className={`flex items-end gap-2 ${m.direcao === "enviada" ? "justify-end" : "justify-start"}`}>
              {m.direcao === "recebida" && <Avatar nome={nomeContato} fotoUrl={conversa.foto_perfil_url} tamanho="sm" />}
              <div
                className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${
                  m.direcao === "enviada" ? "bg-blue text-white rounded-br-sm" : "bg-white text-navy border border-navy/15 rounded-bl-sm"
                }`}
              >
                {m.direcao === "enviada" && m.gcs?.nome && <div className="text-[11px] font-semibold text-white/70 mb-0.5">{m.gcs.nome}</div>}
                <ConteudoMensagem mensagem={m} />
                <div className={`flex items-center gap-1 justify-end mt-1 text-[10px] ${m.direcao === "enviada" ? "text-white/70" : "text-navy/40"}`}>
                  {new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {m.direcao === "enviada" && <StatusIcone status={m.status_entrega} />}
                </div>
              </div>
            </div>
          )
        )}
        <div ref={fimDasMensagensRef} />
      </div>

      <form onSubmit={enviar} className="border-t border-navy/15 bg-white p-3 flex flex-col gap-2">
        {!dentroDaJanela && (
          <div className="flex items-center gap-2 text-xs text-warning bg-warning-bg rounded-md px-2.5 py-1.5">
            <AlertTriangle size={13} />
            Fora da janela de 24h — o Instagram não tem template pra reabrir. Espere o contato escrever de novo.
          </div>
        )}

        <div className="flex gap-2 items-center relative">
          <div ref={menuAnexoRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuAnexoAberto((v) => !v)}
              disabled={enviando || !dentroDaJanela}
              className="p-2.5 rounded-md hover:bg-navy/5 text-navy/60 disabled:opacity-40"
              title="Anexar"
            >
              <Paperclip size={18} />
            </button>
            {menuAnexoAberto && (
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-lg shadow-lg border border-navy/15 overflow-hidden z-10">
                <button type="button" onClick={() => imagemInputRef.current?.click()} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-navy/70 hover:bg-navy/5">
                  <ImageIcon size={14} /> Imagem
                </button>
                <button type="button" onClick={() => videoInputRef.current?.click()} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-navy/70 hover:bg-navy/5">
                  <VideoIcon size={14} /> Vídeo
                </button>
                <div className="border-t border-navy/5" />
                <NotaInternaMenuItem
                  onClick={() => {
                    setNotaAberta(true);
                    setMenuAnexoAberto(false);
                  }}
                />
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
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) enviarArquivo("video", file);
                e.target.value = "";
              }}
            />
          </div>

          <input
            className="input flex-1"
            placeholder={dentroDaJanela ? "Digite uma mensagem..." : "Fora da janela de 24h"}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={!dentroDaJanela}
          />

          <button type="submit" disabled={enviando || !dentroDaJanela || !texto.trim()} className="btn-primary">
            <Send size={15} /> {enviando ? "Enviando..." : "Enviar"}
          </button>
        </div>

        {erroEnvio && <p className="text-xs text-red">{erroEnvio}</p>}
      </form>

      {notaAberta && (
        <NotaInternaModal texto={notaTexto} onTextoChange={setNotaTexto} onCancelar={() => setNotaAberta(false)} onSalvar={enviarNotaInterna} />
      )}
    </>
  );
}

function ConteudoMensagem({ mensagem }: { mensagem: InstagramMensagem }) {
  if (mensagem.tipo === "imagem" && mensagem.midia_url) {
    return (
      <a href={mensagem.midia_url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mensagem.midia_url} alt={mensagem.midia_nome ?? "imagem"} className="rounded-md max-w-full max-h-64 object-contain" />
      </a>
    );
  }
  if (mensagem.tipo === "video" && mensagem.midia_url) {
    return <video controls src={mensagem.midia_url} className="rounded-md max-w-full max-h-64" />;
  }
  return <div className="whitespace-pre-wrap break-words">{mensagem.conteudo}</div>;
}

function StatusIcone({ status }: { status: InstagramMensagem["status_entrega"] }) {
  if (status === "lido") return <CheckCheck size={12} className="text-blue-300" />;
  if (status === "enviado") return <Check size={12} />;
  if (status === "falhou") return <AlertTriangle size={12} className="text-red-300" />;
  return <Clock size={12} />;
}
