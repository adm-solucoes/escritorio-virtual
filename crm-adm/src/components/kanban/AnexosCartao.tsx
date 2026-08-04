"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Trash2, Download, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { KanbanAnexo } from "@/lib/types";

const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10 MB, igual aos anexos de empresa

function formatarTamanho(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Anexos do cartão — arquivo vai pro bucket `anexos` do Supabase Storage
 * (o mesmo que o resto do CRM já usa) e aqui fica só o ponteiro. */
export default function AnexosCartao({
  cartaoId,
  gcId,
  onMudou,
}: {
  cartaoId: string;
  gcId: string | null;
  onMudou: () => void;
}) {
  const [anexos, setAnexos] = useState<KanbanAnexo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("kanban_anexos")
      .select("*")
      .eq("cartao_id", cartaoId)
      .order("criado_em", { ascending: false })
      .then(({ data, error }) => {
        if (cancelado) return;
        // Erro mais provável aqui: a tabela existe no banco mas o Supabase
        // ainda não a reconhece (schema cache desatualizado após a migration).
        // Dizer isso explicitamente evita alguém achar que perdeu arquivo.
        if (error) {
          setErro(
            error.message.includes("schema cache")
              ? "Anexos indisponíveis: recarregue o schema cache no painel do Supabase (Settings → API)."
              : error.message
          );
          return;
        }
        setAnexos((data ?? []) as KanbanAnexo[]);
      });
    return () => {
      cancelado = true;
    };
  }, [cartaoId]);

  async function enviar(file: File) {
    setErro(null);
    if (file.size > TAMANHO_MAXIMO) {
      setErro(`Arquivo grande demais (máx. ${formatarTamanho(TAMANHO_MAXIMO)}).`);
      return;
    }
    setEnviando(true);

    // Nome único: dois arquivos com o mesmo nome não podem se sobrescrever.
    const caminho = `kanban/${cartaoId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    const { error: erroUpload } = await supabase.storage.from("anexos").upload(caminho, file);
    if (erroUpload) {
      setErro("Falha ao enviar: " + erroUpload.message);
      setEnviando(false);
      return;
    }

    const { data: pub } = supabase.storage.from("anexos").getPublicUrl(caminho);
    const { data, error } = await supabase
      .from("kanban_anexos")
      .insert({
        cartao_id: cartaoId,
        nome: file.name,
        url: pub.publicUrl,
        caminho,
        tamanho_bytes: file.size,
        tipo: file.type || null,
        enviado_por: gcId,
      })
      .select()
      .single();

    setEnviando(false);
    if (error) {
      setErro("Falha ao registrar: " + error.message);
      return;
    }
    setAnexos((v) => [data as KanbanAnexo, ...v]);
    onMudou();
  }

  async function remover(anexo: KanbanAnexo) {
    if (!confirm(`Remover "${anexo.nome}"?`)) return;
    setAnexos((v) => v.filter((a) => a.id !== anexo.id));
    // Apaga o arquivo do Storage também — senão fica lixo ocupando espaço
    // (e custo) pra sempre, invisível pra todo mundo.
    if (anexo.caminho) await supabase.storage.from("anexos").remove([anexo.caminho]);
    await supabase.from("kanban_anexos").delete().eq("id", anexo.id);
    onMudou();
  }

  return (
    <section>
      <h3 className="text-xs font-bold text-navy/50 uppercase tracking-wide flex items-center gap-1.5 mb-2">
        <Paperclip size={14} /> Anexos
      </h3>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) enviar(f);
          e.target.value = "";
        }}
      />

      {anexos.length > 0 && (
        <ul className="flex flex-col gap-1.5 mb-2">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 bg-navy/[0.03] rounded-lg px-2.5 py-1.5">
              <Paperclip size={13} className="text-navy/40 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-navy truncate">{a.nome}</p>
                <p className="text-[11px] text-navy/40">
                  {formatarTamanho(a.tamanho_bytes)}
                  {a.tamanho_bytes ? " · " : ""}
                  {new Date(a.criado_em).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-md hover:bg-blue/10 text-blue shrink-0"
                title="Abrir"
                aria-label={`Abrir ${a.nome}`}
              >
                <Download size={14} />
              </a>
              <button
                onClick={() => remover(a)}
                className="p-2 rounded-md hover:bg-red/10 text-red shrink-0"
                title="Remover"
                aria-label={`Remover ${a.nome}`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {erro && <p className="text-xs text-red mb-2">{erro}</p>}

      <button
        onClick={() => inputRef.current?.click()}
        disabled={enviando}
        className="flex items-center gap-1.5 text-sm text-navy/60 hover:text-navy hover:bg-navy/5 rounded-md px-2 py-1.5 transition-colors disabled:opacity-50"
      >
        {enviando ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
        {enviando ? "Enviando..." : "Adicionar anexo"}
      </button>
    </section>
  );
}
