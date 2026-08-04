"use client";

import { useRef, useState } from "react";
import { Image as ImagemIcone, Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

const TAMANHO_MAXIMO = 5 * 1024 * 1024; // 5 MB — é papel de parede, não anexo

/**
 * Fundos prontos, em CSS puro (gradiente), não imagem.
 *
 * Motivo de não usar foto aqui: um quadro é uma tela de trabalho que a pessoa
 * encara o dia todo. Foto com muito detalhe/contraste briga com o texto dos
 * cartões e cansa. Gradiente dá identidade sem atrapalhar a leitura — e
 * carrega instantâneo, sem download nem custo de storage.
 */
export const FUNDOS_PRONTOS = [
  { id: "oceano", nome: "Oceano", css: "linear-gradient(135deg,#0f2027,#203a43,#2c5364)" },
  { id: "crepusculo", nome: "Crepúsculo", css: "linear-gradient(135deg,#150638,#2c1479,#6d5acf)" },
  { id: "brasa", nome: "Brasa", css: "linear-gradient(135deg,#7f1d1d,#c81e1e,#f97316)" },
  { id: "mata", nome: "Mata", css: "linear-gradient(135deg,#064e3b,#0a7a3d,#4ade80)" },
  { id: "areia", nome: "Areia", css: "linear-gradient(135deg,#78350f,#a15c00,#fcd34d)" },
  { id: "grafite", nome: "Grafite", css: "linear-gradient(135deg,#111827,#374151,#6b7280)" },
] as const;

/** Traduz o valor guardado em `imagem_capa` no CSS de fundo. Guardamos o
 * gradiente como `preset:<id>` pra não gravar CSS solto no banco — assim dá
 * pra trocar a paleta depois sem migrar dado. */
export function estiloDeFundo(valor: string | null): string | null {
  if (!valor) return null;
  if (valor.startsWith("preset:")) {
    const p = FUNDOS_PRONTOS.find((f) => f.id === valor.slice(7));
    return p ? p.css : null;
  }
  return `url(${valor})`;
}

export default function FundoQuadro({
  valorAtual,
  onEscolher,
}: {
  valorAtual: string | null;
  onEscolher: (valor: string | null) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(file: File) {
    setErro(null);
    if (!file.type.startsWith("image/")) {
      setErro("Escolha um arquivo de imagem.");
      return;
    }
    if (file.size > TAMANHO_MAXIMO) {
      setErro("Imagem grande demais (máx. 5 MB).");
      return;
    }
    setEnviando(true);

    const caminho = `kanban-fundos/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error } = await supabase.storage.from("anexos").upload(caminho, file);
    if (error) {
      setErro("Falha ao enviar: " + error.message);
      setEnviando(false);
      return;
    }

    const { data: pub } = supabase.storage.from("anexos").getPublicUrl(caminho);
    setEnviando(false);
    onEscolher(pub.publicUrl);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-semibold text-navy/50 uppercase tracking-wide flex items-center gap-1.5">
        <ImagemIcone size={13} /> Fundo do quadro
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {FUNDOS_PRONTOS.map((f) => {
          const ativo = valorAtual === `preset:${f.id}`;
          return (
            <button
              key={f.id}
              onClick={() => onEscolher(`preset:${f.id}`)}
              title={f.nome}
              aria-label={`Fundo ${f.nome}`}
              style={{ backgroundImage: f.css }}
              className={`w-11 h-8 rounded-md border border-navy/10 ${
                ativo ? "ring-2 ring-offset-1 ring-navy" : ""
              }`}
            />
          );
        })}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) enviar(f);
            e.target.value = "";
          }}
        />

        <button
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="flex items-center gap-1.5 text-sm font-semibold text-navy border border-navy/15 px-3 py-1.5 rounded-md hover:bg-navy/5 disabled:opacity-50"
        >
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {enviando ? "Enviando..." : "Enviar imagem"}
        </button>

        {valorAtual && (
          <button
            onClick={() => onEscolher(null)}
            className="flex items-center gap-1 text-sm font-semibold text-red hover:bg-red/5 px-2 py-1.5 rounded-md"
          >
            <X size={14} /> Remover
          </button>
        )}
      </div>

      {erro && <p className="text-xs text-red">{erro}</p>}
      <p className="text-[11px] text-navy/40">
        Imagem própria: até 5 MB. Sobre a foto entra um véu escuro pra manter os cartões legíveis.
      </p>
    </div>
  );
}
