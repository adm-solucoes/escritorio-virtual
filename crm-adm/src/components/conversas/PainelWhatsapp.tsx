"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Clock, Send, AlertTriangle, Paperclip, Image as ImageIcon, FileText, Mic, File as FileIcon, Trash2, ChevronLeft } from "lucide-react";
import Recorder from "opus-recorder";
import { supabase } from "@/lib/supabase";
import type { Gc, WhatsappConversa, WhatsappMensagem } from "@/lib/types";
import Avatar from "@/components/Avatar";
import CanalBadge from "@/components/CanalBadge";
import { NotaInternaBubble, NotaInternaMenuItem, NotaInternaModal } from "@/components/NotaInterna";

interface Props {
  conversa: WhatsappConversa;
  gcAtual: Gc | null;
  onVoltarMobile: () => void;
  onConversaAtualizada: () => void;
}

export default function PainelWhatsapp({ conversa, gcAtual, onVoltarMobile, onConversaAtualizada }: Props) {
  const [mensagens, setMensagens] = useState<WhatsappMensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false);
  const [notaAberta, setNotaAberta] = useState(false);
  const [notaTexto, setNotaTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [duracaoGravacao, setDuracaoGravacao] = useState(0);
  const fimDasMensagensRef = useRef<HTMLDivElement>(null);
  const menuAnexoRef = useRef<HTMLDivElement>(null);
  const imagemInputRef = useRef<HTMLInputElement>(null);
  const documentoInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const chunksGravacaoRef = useRef<Uint8Array[]>([]);
  const canceladaGravacaoRef = useRef(false);
  const intervaloGravacaoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const canvasOndaRef = useRef<HTMLCanvasElement>(null);
  const analiserRef = useRef<AnalyserNode | null>(null);
  const streamVisualizacaoRef = useRef<MediaStream | null>(null);
  const audioContextVisualizacaoRef = useRef<AudioContext | null>(null);
  const animacaoOndaRef = useRef<number | null>(null);

  async function carregarMensagens() {
    const { data } = await supabase
      .from("whatsapp_mensagens")
      .select("*, gcs(nome, foto_url)")
      .eq("conversa_id", conversa.id)
      .order("criado_em", { ascending: true });
    setMensagens((data as unknown as WhatsappMensagem[]) ?? []);
  }

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("whatsapp_mensagens")
      .select("*, gcs(nome, foto_url)")
      .eq("conversa_id", conversa.id)
      .order("criado_em", { ascending: true })
      .then(({ data }) => {
        if (cancelado) return;
        setMensagens((data as unknown as WhatsappMensagem[]) ?? []);
      });
    supabase.from("whatsapp_conversas").update({ nao_lidas: 0 }).eq("id", conversa.id).then(() => onConversaAtualizada());

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

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    setErroEnvio(null);
    const res = await fetch("/api/whatsapp/enviar", {
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

  async function enviarArquivo(tipo: "imagem" | "documento" | "audio", file: File) {
    setMenuAnexoAberto(false);
    setEnviando(true);
    setErroEnvio(null);
    const caminho = `${conversa.id}/${Date.now()}-${file.name}`;
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

  function desenharOnda() {
    const canvas = canvasOndaRef.current;
    const analiser = analiserRef.current;
    if (!canvas || !analiser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bufferLength = analiser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const desenhar = () => {
      if (!analiserRef.current) return;
      animacaoOndaRef.current = requestAnimationFrame(desenhar);
      analiser.getByteTimeDomainData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--adm-red").trim() || "#c81e1e";
      ctx.beginPath();
      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
    };
    desenhar();
  }

  async function iniciarVisualizacao() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamVisualizacaoRef.current = stream;
      const audioCtx = new AudioContext();
      audioContextVisualizacaoRef.current = audioCtx;
      if (audioCtx.state === "suspended") await audioCtx.resume();
      const source = audioCtx.createMediaStreamSource(stream);
      const analiser = audioCtx.createAnalyser();
      analiser.fftSize = 256;
      analiser.smoothingTimeConstant = 0.4;
      source.connect(analiser);
      analiserRef.current = analiser;
      desenharOnda();
    } catch (e) {
      console.error("Erro ao iniciar visualização do áudio:", e);
    }
  }

  function pararVisualizacao() {
    if (animacaoOndaRef.current) cancelAnimationFrame(animacaoOndaRef.current);
    animacaoOndaRef.current = null;
    analiserRef.current = null;
    streamVisualizacaoRef.current?.getTracks().forEach((t) => t.stop());
    streamVisualizacaoRef.current = null;
    audioContextVisualizacaoRef.current?.close().catch(() => {});
    audioContextVisualizacaoRef.current = null;
  }

  async function iniciarGravacao() {
    setErroEnvio(null);
    try {
      const recorder = new Recorder({
        encoderPath: "/encoderWorker.min.js",
        numberOfChannels: 1,
        encoderSampleRate: 24000,
        encoderBitRate: 24000,
      });
      chunksGravacaoRef.current = [];
      canceladaGravacaoRef.current = false;

      recorder.ondataavailable = (typedArray: Uint8Array) => {
        chunksGravacaoRef.current.push(typedArray);
      };
      recorder.onstop = () => {
        pararVisualizacao();
        if (!canceladaGravacaoRef.current && chunksGravacaoRef.current.length > 0) {
          const tipoOgg = "audio/ogg; codecs=opus";
          const blob = new Blob(chunksGravacaoRef.current as BlobPart[], { type: tipoOgg });
          const arquivo = new File([blob], `audio-${Date.now()}.ogg`, { type: tipoOgg });
          enviarArquivo("audio", arquivo);
        }
      };

      await recorder.start();
      recorderRef.current = recorder;
      setGravando(true);
      setDuracaoGravacao(0);
      intervaloGravacaoRef.current = setInterval(() => setDuracaoGravacao((d) => d + 1), 1000);
      iniciarVisualizacao();
    } catch {
      setErroEnvio("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  }

  function pararESalvarGravacao() {
    if (intervaloGravacaoRef.current) clearInterval(intervaloGravacaoRef.current);
    setGravando(false);
    recorderRef.current?.stop();
  }

  function cancelarGravacao() {
    canceladaGravacaoRef.current = true;
    if (intervaloGravacaoRef.current) clearInterval(intervaloGravacaoRef.current);
    setGravando(false);
    recorderRef.current?.stop();
  }

  function formatarDuracao(segundos: number) {
    const m = Math.floor(segundos / 60).toString().padStart(2, "0");
    const s = (segundos % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  async function enviarNotaInterna() {
    if (!notaTexto.trim()) return;
    const res = await fetch("/api/whatsapp/enviar", {
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

  const nomeContato = conversa.empresas?.nome_empresa ?? conversa.nome_perfil_whatsapp ?? conversa.telefone;

  return (
    <>
      <div className="px-5 py-3 border-b border-navy/15 bg-white flex items-center gap-3">
        <button
          onClick={onVoltarMobile}
          className="md:hidden -ml-1.5 p-2.5 rounded-md hover:bg-navy/5 text-navy/60 shrink-0"
          title="Voltar pra lista de conversas"
          aria-label="Voltar pra lista de conversas"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="relative shrink-0">
          <Avatar nome={nomeContato} tamanho="md" />
          <CanalBadge canal="whatsapp" tamanho="sm" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-navy truncate">{conversa.empresas?.nome_empresa ?? conversa.nome_perfil_whatsapp ?? "—"}</div>
          <div className="text-xs text-navy/50 truncate">
            {conversa.telefone}
            {conversa.empresas?.nome_empresa && conversa.nome_perfil_whatsapp && <> · perfil do WhatsApp: {conversa.nome_perfil_whatsapp}</>}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2 bg-navy/[0.02]">
        {mensagens.map((m) =>
          m.interna ? (
            <NotaInternaBubble key={m.id} autor={m.gcs?.nome} conteudo={m.conteudo} criadoEm={m.criado_em} />
          ) : (
            <div key={m.id} className={`flex items-end gap-2 ${m.direcao === "enviada" ? "justify-end" : "justify-start"}`}>
              {m.direcao === "recebida" && <Avatar nome={nomeContato} tamanho="sm" />}
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
        <div className="flex gap-2 items-center relative">
          <div ref={menuAnexoRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuAnexoAberto((v) => !v)}
              disabled={enviando || gravando}
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
                <button type="button" onClick={() => documentoInputRef.current?.click()} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-navy/70 hover:bg-navy/5">
                  <FileText size={14} /> Documento
                </button>
                <button type="button" onClick={() => audioInputRef.current?.click()} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-navy/70 hover:bg-navy/5">
                  <Mic size={14} /> Áudio
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

          {gravando ? (
            <div className="flex-1 flex items-center gap-3 bg-red/5 border border-red/20 rounded-md px-3 py-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red animate-pulse shrink-0" />
              <span className="text-sm font-semibold text-navy tabular-nums">{formatarDuracao(duracaoGravacao)}</span>
              <canvas ref={canvasOndaRef} width={240} height={32} className="flex-1 h-8" />
            </div>
          ) : (
            <input className="input flex-1" placeholder="Digite uma mensagem..." value={texto} onChange={(e) => setTexto(e.target.value)} />
          )}

          {gravando ? (
            <>
              <button type="button" onClick={cancelarGravacao} className="p-2.5 rounded-md hover:bg-red/5 text-red" title="Cancelar gravação">
                <Trash2 size={18} />
              </button>
              <button type="button" onClick={pararESalvarGravacao} className="btn-primary">
                <Send size={15} /> Enviar áudio
              </button>
            </>
          ) : !texto.trim() ? (
            <button type="button" onClick={iniciarGravacao} disabled={enviando} className="p-2.5 rounded-md hover:bg-navy/5 text-navy/60" title="Gravar áudio">
              <Mic size={18} />
            </button>
          ) : (
            <button type="submit" disabled={enviando} className="btn-primary">
              <Send size={15} /> {enviando ? "Enviando..." : "Enviar"}
            </button>
          )}
        </div>

        {erroEnvio && <p className="text-xs text-red">{erroEnvio}</p>}
      </form>

      {notaAberta && (
        <NotaInternaModal texto={notaTexto} onTextoChange={setNotaTexto} onCancelar={() => setNotaAberta(false)} onSalvar={enviarNotaInterna} />
      )}
    </>
  );
}

function ConteudoMensagem({ mensagem }: { mensagem: WhatsappMensagem }) {
  if (mensagem.tipo === "imagem" && mensagem.midia_url) {
    return (
      <a href={mensagem.midia_url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mensagem.midia_url} alt={mensagem.midia_nome ?? "imagem"} className="rounded-md max-w-full max-h-64 object-contain" />
      </a>
    );
  }
  if (mensagem.tipo === "documento" && mensagem.midia_url) {
    return (
      <a href={mensagem.midia_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline break-all">
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
