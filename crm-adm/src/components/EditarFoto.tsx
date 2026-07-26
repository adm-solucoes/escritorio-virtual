"use client";

import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Gc } from "@/lib/types";
import Avatar from "./Avatar";

const TAMANHO_MAXIMO_BYTES = 3 * 1024 * 1024;

export default function EditarFoto({ gc, onAtualizado }: { gc: Gc; onAtualizado: (fotoUrl: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function selecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErro("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > TAMANHO_MAXIMO_BYTES) {
      setErro("Imagem muito grande — o limite é 3 MB.");
      return;
    }

    setEnviando(true);
    setErro(null);

    const caminho = `${gc.id}/${Date.now()}-${file.name}`;
    const { error: erroUpload } = await supabase.storage.from("avatares").upload(caminho, file);
    if (erroUpload) {
      setEnviando(false);
      setErro("Erro ao enviar imagem: " + erroUpload.message);
      return;
    }

    const { data: pub } = supabase.storage.from("avatares").getPublicUrl(caminho);
    const { error: erroUpdate } = await supabase.from("gcs").update({ foto_url: pub.publicUrl }).eq("id", gc.id);
    setEnviando(false);

    if (erroUpdate) {
      setErro("Erro ao salvar: " + erroUpdate.message);
      return;
    }

    onAtualizado(pub.publicUrl);
  }

  async function remover() {
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.from("gcs").update({ foto_url: null }).eq("id", gc.id);
    setEnviando(false);
    if (error) {
      setErro("Erro ao remover: " + error.message);
      return;
    }
    onAtualizado(null);
  }

  return (
    <div className="bg-white rounded-xl border border-navy/10 shadow-sm p-4 flex items-center gap-4 max-w-md">
      <Avatar nome={gc.nome} fotoUrl={gc.foto_url} tamanho="lg" />
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-navy bg-navy/5 hover:bg-navy/10 disabled:opacity-50"
          >
            <Camera size={13} /> {enviando ? "Enviando..." : gc.foto_url ? "Trocar foto" : "Adicionar foto"}
          </button>
          {gc.foto_url && (
            <button
              type="button"
              onClick={remover}
              disabled={enviando}
              className="p-1.5 rounded-md hover:bg-red/10 text-red disabled:opacity-50"
              title="Remover foto"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <p className="text-[11px] text-navy/40">JPG ou PNG, até 3 MB. Aparece na barra lateral e nas suas mensagens.</p>
        {erro && <p className="text-xs text-red">{erro}</p>}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={selecionarArquivo} />
      </div>
    </div>
  );
}
