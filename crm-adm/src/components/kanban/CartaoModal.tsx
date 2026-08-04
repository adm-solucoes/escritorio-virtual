"use client";

import { useEffect, useState } from "react";
import {
  X, Tag, Users, CalendarClock, CheckSquare, Plus, Trash2, Archive, Send, AlignLeft, Check, Copy,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useGcAtual } from "@/lib/useGcAtual";
import Avatar from "@/components/Avatar";
import AnexosCartao from "./AnexosCartao";
import HistoricoCartao from "./HistoricoCartao";
import { registrarAtividade } from "@/lib/kanban-atividade";
import {
  classeEtiqueta,
  type Gc,
  type KanbanCartao,
  type KanbanChecklist,
  type KanbanChecklistItem,
  type KanbanComentario,
  type KanbanEtiqueta,
} from "@/lib/types";

/**
 * Dispara o aviso por e-mail sem travar a interface.
 *
 * Nunca lança: e-mail é efeito secundário. Se o Resend estiver fora do ar, a
 * atribuição e o comentário já foram salvos — segurar a tela ou mostrar erro
 * por causa disso só atrapalharia quem está trabalhando.
 */
function notificar(corpo: { tipo: "atribuicao" | "comentario"; cartaoId: string; destinatarioGcId?: string; texto?: string }) {
  fetch("/api/kanban/notificar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  }).catch((e) => console.warn("[kanban] aviso por e-mail não saiu:", e));
}

export default function CartaoModal({
  cartao,
  etiquetasDoQuadro,
  gcs,
  onFechar,
  onMudou,
}: {
  cartao: KanbanCartao;
  etiquetasDoQuadro: KanbanEtiqueta[];
  gcs: Gc[];
  onFechar: () => void;
  onMudou: () => void;
}) {
  const { gc: gcAtual } = useGcAtual();

  const [titulo, setTitulo] = useState(cartao.titulo);
  const [descricao, setDescricao] = useState(cartao.descricao ?? "");
  const [editandoDesc, setEditandoDesc] = useState(false);
  const [dataInicio, setDataInicio] = useState(cartao.data_inicio ? cartao.data_inicio.slice(0, 10) : "");
  const [prazo, setPrazo] = useState(cartao.prazo ? cartao.prazo.slice(0, 10) : "");
  const [prazoConcluido, setPrazoConcluido] = useState(cartao.prazo_concluido);
  /** Muda a cada ação registrada, pra o histórico recarregar sozinho. */
  const [versaoHistorico, setVersaoHistorico] = useState(0);

  const [etiquetasIds, setEtiquetasIds] = useState<string[]>((cartao.etiquetas ?? []).map((e) => e.id));
  const [membrosIds, setMembrosIds] = useState<string[]>((cartao.membros ?? []).map((m) => m.id));
  const [painel, setPainel] = useState<"etiquetas" | "membros" | null>(null);

  const [checklists, setChecklists] = useState<KanbanChecklist[]>([]);
  const [comentarios, setComentarios] = useState<KanbanComentario[]>([]);
  const [novoComentario, setNovoComentario] = useState("");
  const [novoItem, setNovoItem] = useState<Record<string, string>>({});

  // Carrega checklists (com itens) e comentários do cartão.
  useEffect(() => {
    let cancelado = false;
    Promise.all([
      supabase.from("kanban_checklists").select("*").eq("cartao_id", cartao.id).order("posicao"),
      supabase.from("kanban_checklist_itens").select("*").order("posicao"),
      supabase
        .from("kanban_comentarios")
        .select("*, gcs(nome, foto_url)")
        .eq("cartao_id", cartao.id)
        .order("criado_em"),
    ]).then(([listas, itens, coments]) => {
      if (cancelado) return;
      const todosItens = (itens.data ?? []) as KanbanChecklistItem[];
      setChecklists(
        ((listas.data ?? []) as KanbanChecklist[]).map((cl) => ({
          ...cl,
          itens: todosItens.filter((i) => i.checklist_id === cl.id),
        }))
      );
      setComentarios((coments.data ?? []) as unknown as KanbanComentario[]);
    });
    return () => {
      cancelado = true;
    };
  }, [cartao.id]);

  async function salvarCampo(patch: Record<string, unknown>, descricaoHistorico?: string) {
    await supabase
      .from("kanban_cartoes")
      .update({ ...patch, atualizado_em: new Date().toISOString() })
      .eq("id", cartao.id);
    if (descricaoHistorico) {
      await registrarAtividade(cartao.id, gcAtual?.id ?? null, "editou", descricaoHistorico);
      setVersaoHistorico((v) => v + 1);
    }
    onMudou();
  }

  /** Duplicar cartão — copia o conteúdo e os vínculos (etiquetas, membros),
   * mas NÃO comentários, anexos nem histórico: esses pertencem à conversa do
   * cartão original, copiá-los criaria um passado falso no cartão novo. */
  async function duplicar() {
    const { data: novo, error } = await supabase
      .from("kanban_cartoes")
      .insert({
        lista_id: cartao.lista_id,
        titulo: `${cartao.titulo} (cópia)`,
        descricao: cartao.descricao,
        posicao: cartao.posicao + 1,
        data_inicio: cartao.data_inicio,
        prazo: cartao.prazo,
        criado_por: gcAtual?.id ?? null,
      })
      .select("id")
      .single();

    if (error || !novo) {
      alert("Não foi possível duplicar: " + (error?.message ?? "erro desconhecido"));
      return;
    }

    if (etiquetasIds.length) {
      await supabase
        .from("kanban_cartao_etiquetas")
        .insert(etiquetasIds.map((etiqueta_id) => ({ cartao_id: novo.id, etiqueta_id })));
    }
    if (membrosIds.length) {
      await supabase
        .from("kanban_cartao_membros")
        .insert(membrosIds.map((gc_id) => ({ cartao_id: novo.id, gc_id })));
    }

    onMudou();
    onFechar();
  }

  async function alternarEtiqueta(id: string) {
    const tem = etiquetasIds.includes(id);
    setEtiquetasIds((v) => (tem ? v.filter((x) => x !== id) : [...v, id]));
    if (tem) {
      await supabase.from("kanban_cartao_etiquetas").delete().eq("cartao_id", cartao.id).eq("etiqueta_id", id);
    } else {
      await supabase.from("kanban_cartao_etiquetas").insert({ cartao_id: cartao.id, etiqueta_id: id });
    }
    onMudou();
  }

  async function alternarMembro(id: string) {
    const tem = membrosIds.includes(id);
    setMembrosIds((v) => (tem ? v.filter((x) => x !== id) : [...v, id]));
    if (tem) {
      await supabase.from("kanban_cartao_membros").delete().eq("cartao_id", cartao.id).eq("gc_id", id);
    } else {
      await supabase.from("kanban_cartao_membros").insert({ cartao_id: cartao.id, gc_id: id });
      // Avisa por e-mail quem acabou de virar responsável. Sem `await`: se o
      // e-mail falhar ou demorar, a atribuição já está salva e a tela não
      // pode ficar travada esperando.
      notificar({ tipo: "atribuicao", cartaoId: cartao.id, destinatarioGcId: id });
      registrarAtividade(
        cartao.id,
        gcAtual?.id ?? null,
        "atribuiu",
        `colocou ${gcs.find((g) => g.id === id)?.nome ?? "alguém"} como responsável`
      );
      setVersaoHistorico((v) => v + 1);
    }
    onMudou();
  }

  async function adicionarChecklist() {
    const { data } = await supabase
      .from("kanban_checklists")
      .insert({ cartao_id: cartao.id, titulo: "Checklist" })
      .select()
      .single();
    if (data) setChecklists((v) => [...v, { ...(data as KanbanChecklist), itens: [] }]);
  }

  async function adicionarItem(checklistId: string) {
    const texto = (novoItem[checklistId] ?? "").trim();
    if (!texto) return;
    const lista = checklists.find((c) => c.id === checklistId);
    const posicao = ((lista?.itens?.at(-1)?.posicao ?? 0) as number) + 1000;
    const { data } = await supabase
      .from("kanban_checklist_itens")
      .insert({ checklist_id: checklistId, texto, posicao })
      .select()
      .single();
    if (data) {
      setChecklists((v) =>
        v.map((c) => (c.id === checklistId ? { ...c, itens: [...(c.itens ?? []), data as KanbanChecklistItem] } : c))
      );
      setNovoItem((v) => ({ ...v, [checklistId]: "" }));
      onMudou();
    }
  }

  async function alternarItem(item: KanbanChecklistItem) {
    const novo = !item.concluido;
    setChecklists((v) =>
      v.map((c) => ({
        ...c,
        itens: (c.itens ?? []).map((i) => (i.id === item.id ? { ...i, concluido: novo } : i)),
      }))
    );
    await supabase.from("kanban_checklist_itens").update({ concluido: novo }).eq("id", item.id);
    onMudou();
  }

  async function removerItem(item: KanbanChecklistItem) {
    setChecklists((v) =>
      v.map((c) => ({ ...c, itens: (c.itens ?? []).filter((i) => i.id !== item.id) }))
    );
    await supabase.from("kanban_checklist_itens").delete().eq("id", item.id);
    onMudou();
  }

  async function removerChecklist(id: string) {
    setChecklists((v) => v.filter((c) => c.id !== id));
    await supabase.from("kanban_checklists").delete().eq("id", id);
    onMudou();
  }

  async function enviarComentario(e: React.FormEvent) {
    e.preventDefault();
    const texto = novoComentario.trim();
    if (!texto || !gcAtual) return;
    const { data } = await supabase
      .from("kanban_comentarios")
      .insert({ cartao_id: cartao.id, gc_id: gcAtual.id, texto })
      .select("*, gcs(nome, foto_url)")
      .single();
    if (data) {
      setComentarios((v) => [...v, data as unknown as KanbanComentario]);
      setNovoComentario("");
      // Avisa os responsáveis do cartão (menos quem escreveu) — é o que evita
      // uma pergunta ficar dias parada porque ninguém abriu o quadro.
      notificar({ tipo: "comentario", cartaoId: cartao.id, texto });
      onMudou();
    }
  }

  async function arquivar() {
    if (!confirm("Arquivar este cartão? Ele sai do quadro mas não é apagado.")) return;
    await supabase.from("kanban_cartoes").update({ arquivado: true }).eq("id", cartao.id);
    onMudou();
    onFechar();
  }

  const totalItens = checklists.reduce((n, c) => n + (c.itens?.length ?? 0), 0);
  const feitos = checklists.reduce((n, c) => n + (c.itens ?? []).filter((i) => i.concluido).length, 0);

  return (
    <div className="fixed inset-0 z-50 bg-navy/50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8 flex flex-col">
        {/* topo */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-navy/15">
          <textarea
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onBlur={() => titulo.trim() && titulo !== cartao.titulo && salvarCampo({ titulo: titulo.trim() })}
            rows={1}
            className="flex-1 min-w-0 font-extrabold text-lg text-navy resize-none border-0 focus:ring-0 p-0 bg-transparent"
          />
          <button onClick={onFechar} className="p-1 rounded-md hover:bg-navy/5 text-navy/60 shrink-0" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 flex flex-col gap-5">
          {/* ações rápidas */}
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <button
                onClick={() => setPainel(painel === "etiquetas" ? null : "etiquetas")}
                className="flex items-center gap-1.5 text-sm font-semibold text-navy border border-navy/15 px-3 py-1.5 rounded-md hover:bg-navy/5"
              >
                <Tag size={14} /> Etiquetas
              </button>
              {painel === "etiquetas" && (
                <div className="absolute left-0 top-full mt-1 z-20 w-56 bg-white rounded-lg shadow-lg border border-navy/15 p-2 flex flex-col gap-1">
                  {etiquetasDoQuadro.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => alternarEtiqueta(e.id)}
                      className={`flex items-center justify-between text-xs font-bold px-2 py-1.5 rounded border ${classeEtiqueta(e.cor)}`}
                    >
                      {e.nome}
                      {etiquetasIds.includes(e.id) && <Check size={13} />}
                    </button>
                  ))}
                  {etiquetasDoQuadro.length === 0 && (
                    <p className="text-xs text-navy/40 px-1 py-2">Nenhuma etiqueta neste quadro.</p>
                  )}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setPainel(painel === "membros" ? null : "membros")}
                className="flex items-center gap-1.5 text-sm font-semibold text-navy border border-navy/15 px-3 py-1.5 rounded-md hover:bg-navy/5"
              >
                <Users size={14} /> Responsáveis
              </button>
              {painel === "membros" && (
                <div className="absolute left-0 top-full mt-1 z-20 w-60 max-h-64 overflow-y-auto bg-white rounded-lg shadow-lg border border-navy/15 p-1.5 flex flex-col gap-0.5">
                  {gcs.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => alternarMembro(g.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-navy/5 text-left"
                    >
                      <Avatar nome={g.nome} fotoUrl={g.foto_url} tamanho="sm" />
                      <span className="text-sm text-navy/80 truncate flex-1">{g.nome}</span>
                      {membrosIds.includes(g.id) && <Check size={14} className="text-success shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={adicionarChecklist}
              className="flex items-center gap-1.5 text-sm font-semibold text-navy border border-navy/15 px-3 py-1.5 rounded-md hover:bg-navy/5"
            >
              <CheckSquare size={14} /> Checklist
            </button>

            <button
              onClick={duplicar}
              className="flex items-center gap-1.5 text-sm font-semibold text-navy border border-navy/15 px-3 py-1.5 rounded-md hover:bg-navy/5"
            >
              <Copy size={14} /> Duplicar
            </button>

            <button
              onClick={arquivar}
              className="flex items-center gap-1.5 text-sm font-semibold text-red border border-red/20 px-3 py-1.5 rounded-md hover:bg-red/5 ml-auto"
            >
              <Archive size={14} /> Arquivar
            </button>
          </div>

          {/* etiquetas e responsáveis aplicados */}
          {(etiquetasIds.length > 0 || membrosIds.length > 0) && (
            <div className="flex flex-wrap items-center gap-3">
              {etiquetasIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {etiquetasDoQuadro
                    .filter((e) => etiquetasIds.includes(e.id))
                    .map((e) => (
                      <span
                        key={e.id}
                        className={`text-[11px] font-bold px-2 py-1 rounded border ${classeEtiqueta(e.cor)}`}
                      >
                        {e.nome}
                      </span>
                    ))}
                </div>
              )}
              {membrosIds.length > 0 && (
                <div className="flex -space-x-1.5">
                  {gcs
                    .filter((g) => membrosIds.includes(g.id))
                    .map((g) => (
                      <Avatar key={g.id} nome={g.nome} fotoUrl={g.foto_url} tamanho="sm" />
                    ))}
                </div>
              )}
            </div>
          )}

          {/* datas */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-navy/40 uppercase tracking-wide flex items-center gap-1.5">
              <CalendarClock size={13} /> Início
            </span>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value);
                salvarCampo(
                  { data_inicio: e.target.value ? new Date(e.target.value).toISOString() : null },
                  e.target.value ? "definiu a data de início" : "removeu a data de início"
                );
              }}
              className="text-sm border border-navy/15 rounded-md px-2 py-1"
            />

            <span className="text-xs font-semibold text-navy/40 uppercase tracking-wide flex items-center gap-1.5 ml-2">
              Prazo
            </span>
            <input
              type="date"
              value={prazo}
              onChange={(e) => {
                setPrazo(e.target.value);
                salvarCampo(
                  { prazo: e.target.value ? new Date(e.target.value).toISOString() : null },
                  e.target.value ? "definiu o prazo" : "removeu o prazo"
                );
              }}
              className="text-sm border border-navy/15 rounded-md px-2 py-1"
            />
            {prazo && (
              <label className="flex items-center gap-1.5 text-sm text-navy/70">
                <input
                  type="checkbox"
                  checked={prazoConcluido}
                  onChange={(e) => {
                    setPrazoConcluido(e.target.checked);
                    salvarCampo({ prazo_concluido: e.target.checked });
                  }}
                />
                concluído
              </label>
            )}
          </div>

          {/* descrição */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-navy/40 uppercase tracking-wide flex items-center gap-1.5">
              <AlignLeft size={13} /> Descrição
            </span>
            {editandoDesc ? (
              <>
                <textarea
                  autoFocus
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={5}
                  className="text-sm border border-navy/20 rounded-lg px-3 py-2 resize-y"
                  placeholder="O que precisa ser feito, por quê, e como saber que está pronto..."
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      salvarCampo({ descricao: descricao.trim() || null });
                      setEditandoDesc(false);
                    }}
                    className="text-sm font-semibold bg-navy text-white px-3 py-1.5 rounded-md"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => {
                      setDescricao(cartao.descricao ?? "");
                      setEditandoDesc(false);
                    }}
                    className="text-sm text-navy/50 px-2"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setEditandoDesc(true)}
                className="text-left text-sm text-navy/80 bg-navy/[0.03] hover:bg-navy/[0.06] rounded-lg px-3 py-2.5 min-h-[52px] whitespace-pre-wrap transition-colors"
              >
                {descricao || <span className="text-navy/40">Adicionar uma descrição...</span>}
              </button>
            )}
          </div>

          {/* checklists */}
          {checklists.length > 0 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-navy/40 uppercase tracking-wide">Checklists</span>
                {totalItens > 0 && (
                  <span className="text-xs text-navy/50 tabular-nums">
                    {feitos}/{totalItens}
                  </span>
                )}
              </div>

              {checklists.map((cl) => {
                const itens = cl.itens ?? [];
                const ok = itens.filter((i) => i.concluido).length;
                const pct = itens.length ? Math.round((ok / itens.length) * 100) : 0;
                return (
                  <div key={cl.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-navy flex-1">{cl.titulo}</span>
                      <span className="text-xs text-navy/40 tabular-nums">{pct}%</span>
                      <button
                        onClick={() => removerChecklist(cl.id)}
                        className="p-1 text-navy/30 hover:text-red"
                        aria-label="Remover checklist"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="h-1.5 bg-navy/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct === 100 ? "bg-success" : "bg-blue"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {itens.map((i) => (
                      <div key={i.id} className="flex items-center gap-2 group">
                        <input
                          type="checkbox"
                          checked={i.concluido}
                          onChange={() => alternarItem(i)}
                          className="shrink-0"
                        />
                        <span className={`text-sm flex-1 ${i.concluido ? "line-through text-navy/40" : "text-navy/80"}`}>
                          {i.texto}
                        </span>
                        <button
                          onClick={() => removerItem(i)}
                          className="p-1 text-navy/20 hover:text-red opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remover item"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center gap-1.5">
                      <input
                        value={novoItem[cl.id] ?? ""}
                        onChange={(e) => setNovoItem((v) => ({ ...v, [cl.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && adicionarItem(cl.id)}
                        placeholder="Adicionar item..."
                        className="flex-1 text-sm border border-navy/15 rounded-md px-2 py-1"
                      />
                      <button
                        onClick={() => adicionarItem(cl.id)}
                        className="p-1.5 text-navy/50 hover:text-navy"
                        aria-label="Adicionar item"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* anexos */}
          <div className="border-t border-navy/10 pt-4">
            <AnexosCartao
              cartaoId={cartao.id}
              gcId={gcAtual?.id ?? null}
              onMudou={() => {
                setVersaoHistorico((v) => v + 1);
                onMudou();
              }}
            />
          </div>

          {/* comentários */}
          <div className="flex flex-col gap-2 border-t border-navy/10 pt-4">
            <span className="text-xs font-semibold text-navy/40 uppercase tracking-wide">Comentários</span>

            {comentarios.length === 0 && (
              <p className="text-xs text-navy/40">Nenhum comentário ainda.</p>
            )}

            {comentarios.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Avatar nome={c.gcs?.nome ?? "?"} fotoUrl={c.gcs?.foto_url ?? null} tamanho="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-semibold text-navy">{c.gcs?.nome ?? "Alguém"}</span>{" "}
                    <span className="text-navy/40">
                      {new Date(c.criado_em).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                  <p className="text-sm text-navy/80 whitespace-pre-wrap">{c.texto}</p>
                </div>
              </div>
            ))}

            <form onSubmit={enviarComentario} className="flex items-center gap-2 mt-1">
              <input
                value={novoComentario}
                onChange={(e) => setNovoComentario(e.target.value)}
                placeholder="Escrever um comentário..."
                className="flex-1 text-sm border border-navy/15 rounded-md px-3 py-2"
              />
              <button
                type="submit"
                disabled={!novoComentario.trim()}
                className="p-2 rounded-md bg-navy text-white disabled:opacity-30"
                aria-label="Enviar comentário"
              >
                <Send size={15} />
              </button>
            </form>
          </div>

          {/* histórico */}
          <div className="border-t border-navy/10 pt-4">
            <HistoricoCartao cartaoId={cartao.id} chave={versaoHistorico} />
          </div>
        </div>
      </div>
    </div>
  );
}
