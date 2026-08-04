"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Avatar from "@/components/Avatar";
import type { KanbanAtividade } from "@/lib/types";

function quando(iso: string) {
  const d = new Date(iso);
  const minutos = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  if (minutos < 60 * 24) return `há ${Math.floor(minutos / 60)}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Feed de atividade do cartão — equivalente ao histórico do Trello. */
export default function HistoricoCartao({ cartaoId, chave }: { cartaoId: string; chave: number }) {
  const [itens, setItens] = useState<KanbanAtividade[]>([]);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("kanban_atividades")
      .select("*, gcs(nome, foto_url)")
      .eq("cartao_id", cartaoId)
      .order("criado_em", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!cancelado) setItens((data ?? []) as unknown as KanbanAtividade[]);
      });
    return () => {
      cancelado = true;
    };
  }, [cartaoId, chave]);

  if (!itens.length) return null;

  return (
    <section>
      <h3 className="text-xs font-bold text-navy/50 uppercase tracking-wide flex items-center gap-1.5 mb-2">
        <History size={14} /> Histórico
      </h3>
      <ul className="flex flex-col gap-2">
        {itens.map((a) => (
          <li key={a.id} className="flex items-start gap-2">
            <Avatar nome={a.gcs?.nome ?? "?"} fotoUrl={a.gcs?.foto_url} tamanho="sm" />
            <p className="text-xs text-navy/70 leading-snug">
              <span className="font-semibold text-navy">{a.gcs?.nome ?? "Alguém"}</span> {a.descricao}
              <span className="text-navy/35"> · {quando(a.criado_em)}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
