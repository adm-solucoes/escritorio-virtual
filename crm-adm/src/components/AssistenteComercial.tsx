"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X, Send, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Gc } from "@/lib/types";

interface Mensagem {
  autor: "usuario" | "ia";
  texto: string;
  erro?: boolean;
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
      if (dados.resposta) {
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
                  Pergunte sobre empresas, oportunidades e pipeline — ex: &quot;quais oportunidades estão paradas há
                  mais tempo?&quot; ou &quot;resumo do que a Sevel Engenharia tem em aberto&quot;.
                </p>
              )}
              {mensagens.map((m, i) => (
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
              ))}
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
