"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, type DragEndEvent, PointerSensor, closestCorners, useSensor, useSensors } from "@dnd-kit/core";
import { Columns3, Plus, Loader2, X, Search, Settings2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useGcAtual } from "@/lib/useGcAtual";
import {
  posicaoEntre,
  type Gc,
  type KanbanCartao,
  type KanbanEtiqueta,
  type KanbanLista,
  type KanbanQuadro,
  TEMAS_QUADRO,
  classeTemaQuadro,
  nivelAcessoDoCargo,
  CARGOS,
} from "@/lib/types";
import ListaKanban from "@/components/kanban/ListaKanban";
import CartaoModal from "@/components/kanban/CartaoModal";
import FundoQuadro, { estiloDeFundo } from "@/components/kanban/FundoQuadro";
import { registrarAtividade } from "@/lib/kanban-atividade";

export default function KanbanPage() {
  const { gc: gcAtual } = useGcAtual();
  const [quadro, setQuadro] = useState<KanbanQuadro | null>(null);
  const [quadros, setQuadros] = useState<KanbanQuadro[]>([]);
  // Guardado em ref (e não em estado) porque o efeito de carregamento precisa
  // ler o valor atual sem virar dependência e recarregar em loop.
  const quadroIdRef = useRef<string | null>(null);
  const [personalizando, setPersonalizando] = useState(false);
  const [listas, setListas] = useState<KanbanLista[]>([]);
  const [cartoes, setCartoes] = useState<KanbanCartao[]>([]);
  const [etiquetas, setEtiquetas] = useState<KanbanEtiqueta[]>([]);
  const [gcs, setGcs] = useState<Gc[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<KanbanCartao | null>(null);
  const [chave, setChave] = useState(0);
  const [criandoLista, setCriandoLista] = useState(false);
  const [nomeLista, setNomeLista] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroEtiqueta, setFiltroEtiqueta] = useState<string | null>(null);
  const [filtroMembro, setFiltroMembro] = useState<string | null>(null);

  // Arrastar só começa depois de 5px de movimento — sem isso, um clique
  // simples no cartão seria interpretado como arrasto e o modal não abriria.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    let cancelado = false;

    (async () => {
      // A RLS já filtra: colaborador só recebe o quadro da própria área,
      // gestor recebe todos. A tela não precisa (e não deve) refazer esse
      // filtro — se refizesse, seria só aparência, e a regra de verdade
      // continuaria sendo a do banco.
      const { data: quadros, error: erroQuadro } = await supabase
        .from("kanban_quadros")
        .select("*")
        .eq("arquivado", false)
        .order("nome");

      if (cancelado) return;
      if (erroQuadro) {
        setErro(
          erroQuadro.message.includes("does not exist")
            ? "As tabelas do Kanban ainda não foram criadas no banco (migration 042)."
            : erroQuadro.message
        );
        setCarregando(false);
        return;
      }

      const todos = (quadros ?? []) as KanbanQuadro[];
      setQuadros(todos);

      // Mantém o quadro aberto ao recarregar; senão abre o primeiro.
      const q = todos.find((x) => x.id === quadroIdRef.current) ?? todos[0];
      if (!q) {
        setErro("Nenhum quadro disponível para o seu acesso.");
        setCarregando(false);
        return;
      }
      quadroIdRef.current = q.id;

      const [ls, es, gs] = await Promise.all([
        supabase.from("kanban_listas").select("*").eq("quadro_id", q.id).eq("arquivada", false).order("posicao"),
        supabase.from("kanban_etiquetas").select("*").eq("quadro_id", q.id).order("criado_em"),
        supabase.from("gcs").select("*").eq("status", "Ativo").order("nome"),
      ]);
      if (cancelado) return;

      // Falha ao buscar as listas tem que aparecer na tela. Sem isso, o
      // quadro renderizava vazio e passava a impressão de que as colunas
      // tinham sido apagadas — quando na verdade só a consulta falhou.
      if (ls.error) {
        setErro(`Não foi possível carregar as listas: ${ls.error.message}`);
        setCarregando(false);
        return;
      }

      const listasIds = ((ls.data ?? []) as KanbanLista[]).map((l) => l.id);

      // Os anexos vêm em consulta separada, de propósito.
      //
      // Pedir `kanban_anexos(id)` junto no select exige que o PostgREST
      // conheça a relação no schema cache dele — e esse cache demora a
      // atualizar depois de criar uma tabela nova. Enquanto não atualiza, a
      // consulta INTEIRA falha ("Could not find a relationship...") e o quadro
      // aparece vazio, mesmo com tudo salvo no banco. Uma consulta simples por
      // cartao_id não depende de relação nenhuma e nunca quebra por isso.
      const cs = listasIds.length
        ? await supabase
            .from("kanban_cartoes")
            .select(
              "*, kanban_cartao_etiquetas(etiqueta_id), kanban_cartao_membros(gc_id), kanban_checklists(id, kanban_checklist_itens(id, concluido)), kanban_comentarios(id)"
            )
            .in("lista_id", listasIds)
            .eq("arquivado", false)
            .order("posicao")
        : { data: [], error: null };
      if (cancelado) return;

      // Erro aqui não pode ser engolido: sem isso, uma falha na consulta
      // devolvia lista vazia e o quadro parecia ter perdido todos os cartões,
      // sem nenhuma explicação na tela.
      if (cs.error) {
        setErro(`Não foi possível carregar os cartões: ${cs.error.message}`);
        setCarregando(false);
        return;
      }

      const cartoesIds = ((cs.data ?? []) as { id: string }[]).map((c) => c.id);
      const anexosPorCartao = new Map<string, number>();
      if (cartoesIds.length) {
        const { data: anexos, error: erroAnexos } = await supabase
          .from("kanban_anexos")
          .select("cartao_id")
          .in("cartao_id", cartoesIds);

        // Falha aqui NÃO derruba o quadro: o número de clipes no cartão é
        // informação secundária. Mostrar o quadro sem esse contador é muito
        // melhor do que mostrar uma tela de erro por causa dele.
        if (erroAnexos) {
          console.warn("[kanban] contador de anexos indisponível:", erroAnexos.message);
        } else {
          for (const a of (anexos ?? []) as { cartao_id: string }[]) {
            anexosPorCartao.set(a.cartao_id, (anexosPorCartao.get(a.cartao_id) ?? 0) + 1);
          }
        }
      }
      if (cancelado) return;

      const todasEtiquetas = (es.data ?? []) as KanbanEtiqueta[];
      const todosGcs = (gs.data ?? []) as Gc[];

      // Achata as tabelas de ligação nos campos que o cartão exibe.
      type CartaoBruto = KanbanCartao & {
        kanban_cartao_etiquetas?: { etiqueta_id: string }[];
        kanban_cartao_membros?: { gc_id: string }[];
        kanban_checklists?: { id: string; kanban_checklist_itens?: { id: string; concluido: boolean }[] }[];
        kanban_comentarios?: { id: string }[];
      };

      const montados = ((cs.data ?? []) as CartaoBruto[]).map((c) => {
        const itens = (c.kanban_checklists ?? []).flatMap((cl) => cl.kanban_checklist_itens ?? []);
        return {
          ...c,
          etiquetas: todasEtiquetas.filter((e) =>
            (c.kanban_cartao_etiquetas ?? []).some((le) => le.etiqueta_id === e.id)
          ),
          membros: todosGcs.filter((g) => (c.kanban_cartao_membros ?? []).some((lm) => lm.gc_id === g.id)),
          totalItens: itens.length,
          itensConcluidos: itens.filter((i) => i.concluido).length,
          totalComentarios: (c.kanban_comentarios ?? []).length,
          totalAnexos: anexosPorCartao.get(c.id) ?? 0,
        } as KanbanCartao;
      });

      setQuadro(q);
      setListas((ls.data ?? []) as KanbanLista[]);
      setEtiquetas(todasEtiquetas);
      setGcs(todosGcs);
      setCartoes(montados);
      setErro(null);
      setCarregando(false);
    })().catch(() => {
      if (!cancelado) {
        setErro("Falha ao carregar o quadro.");
        setCarregando(false);
      }
    });

    return () => {
      cancelado = true;
    };
  }, [chave]);

  const recarregar = () => setChave((k) => k + 1);

  const filtrando = Boolean(busca.trim() || filtroEtiqueta || filtroMembro);

  /** Cartões visíveis após busca/filtro. Usado só pra EXIBIR — o cálculo de
   * posição no arrastar continua em cima de `porLista`, que tem a lista
   * completa: reordenar com o quadro filtrado usando só os visíveis geraria
   * posição errada em relação aos cartões escondidos. */
  const cartoesVisiveis = useMemo(() => {
    if (!filtrando) return cartoes;
    const termo = busca.trim().toLowerCase();
    return cartoes.filter((c) => {
      if (termo && !`${c.titulo} ${c.descricao ?? ""}`.toLowerCase().includes(termo)) return false;
      if (filtroEtiqueta && !(c.etiquetas ?? []).some((e) => e.id === filtroEtiqueta)) return false;
      if (filtroMembro && !(c.membros ?? []).some((m) => m.id === filtroMembro)) return false;
      return true;
    });
  }, [cartoes, busca, filtroEtiqueta, filtroMembro, filtrando]);

  const porLista = useMemo(() => {
    const mapa = new Map<string, KanbanCartao[]>();
    for (const l of listas) mapa.set(l.id, []);
    for (const c of cartoes) mapa.get(c.lista_id)?.push(c);
    for (const [, arr] of mapa) arr.sort((a, b) => a.posicao - b.posicao);
    return mapa;
  }, [listas, cartoes]);

  const porListaVisivel = useMemo(() => {
    const mapa = new Map<string, KanbanCartao[]>();
    for (const l of listas) mapa.set(l.id, []);
    for (const c of cartoesVisiveis) mapa.get(c.lista_id)?.push(c);
    for (const [, arr] of mapa) arr.sort((a, b) => a.posicao - b.posicao);
    return mapa;
  }, [listas, cartoesVisiveis]);

  /**
   * Move o cartão — entre listas OU reordenando dentro da mesma lista.
   *
   * O alvo (`over`) pode ser duas coisas: outro CARTÃO (soltou em cima dele,
   * quer entrar naquela altura) ou uma LISTA (soltou no vazio da coluna, vai
   * pro fim). Os dois casos precisam existir, senão soltar numa coluna vazia
   * não funciona.
   *
   * A posição nova é a média entre os vizinhos de cima e de baixo — é por
   * isso que `posicao` é decimal no banco: grava UMA linha em vez de
   * renumerar a coluna inteira a cada arrasto.
   */
  async function aoSoltar(evento: DragEndEvent) {
    const { active, over } = evento;
    if (!over) return;

    const cartaoId = String(active.id);
    const cartao = cartoes.find((c) => c.id === cartaoId);
    if (!cartao) return;

    const alvoEhLista = over.data.current?.tipo === "lista";
    const listaDestino = alvoEhLista
      ? String(over.id)
      : (over.data.current?.listaId as string | undefined) ??
        cartoes.find((c) => c.id === String(over.id))?.lista_id;
    if (!listaDestino) return;

    // Vizinhos no destino, já sem o cartão arrastado (senão ele entraria no
    // cálculo da própria posição nova e o resultado ficaria errado quando a
    // reordenação é dentro da mesma lista).
    const destino = (porLista.get(listaDestino) ?? []).filter((c) => c.id !== cartaoId);

    let anterior: number | null;
    let proximo: number | null;

    if (alvoEhLista) {
      anterior = destino.at(-1)?.posicao ?? null;
      proximo = null;
    } else {
      const alvo = destino.findIndex((c) => c.id === String(over.id));
      if (alvo === -1) return;
      // Arrastando pra baixo dentro da mesma lista, o cartão passa a ficar
      // DEPOIS do alvo; nos demais casos, antes dele.
      const descendo = cartao.lista_id === listaDestino && cartao.posicao < destino[alvo].posicao;
      anterior = descendo ? destino[alvo].posicao : (destino[alvo - 1]?.posicao ?? null);
      proximo = descendo ? (destino[alvo + 1]?.posicao ?? null) : destino[alvo].posicao;
    }

    const posicao = posicaoEntre(anterior, proximo);
    if (cartao.lista_id === listaDestino && cartao.posicao === posicao) return;

    const anteriorEstado = { lista_id: cartao.lista_id, posicao: cartao.posicao };
    setCartoes((v) => v.map((c) => (c.id === cartaoId ? { ...c, lista_id: listaDestino, posicao } : c)));

    const { error } = await supabase
      .from("kanban_cartoes")
      .update({ lista_id: listaDestino, posicao, atualizado_em: new Date().toISOString() })
      .eq("id", cartaoId);

    // Se a gravação falhar, desfaz na tela pra não mentir sobre o estado real.
    if (error) {
      setCartoes((v) => v.map((c) => (c.id === cartaoId ? { ...c, ...anteriorEstado } : c)));
      alert("Não foi possível mover o cartão: " + error.message);
      return;
    }

    // Só registra no histórico quando MUDOU de lista — reordenar dentro da
    // mesma coluna acontece o tempo todo e encheria o feed de ruído.
    if (anteriorEstado.lista_id !== listaDestino) {
      const de = listas.find((l) => l.id === anteriorEstado.lista_id)?.nome ?? "?";
      const para = listas.find((l) => l.id === listaDestino)?.nome ?? "?";
      await registrarAtividade(cartaoId, gcAtual?.id ?? null, "moveu", `moveu de "${de}" para "${para}"`);
    }
  }

  async function criarCartao(listaId: string, titulo: string) {
    const atuais = porLista.get(listaId) ?? [];
    const posicao = posicaoEntre(atuais.at(-1)?.posicao ?? null, null);
    const { data, error } = await supabase
      .from("kanban_cartoes")
      .insert({ lista_id: listaId, titulo, posicao, criado_por: gcAtual?.id ?? null })
      .select()
      .single();
    if (error) {
      alert("Erro ao criar cartão: " + error.message);
      return;
    }
    setCartoes((v) => [
      ...v,
      { ...(data as KanbanCartao), etiquetas: [], membros: [], totalItens: 0, itensConcluidos: 0, totalComentarios: 0 },
    ]);
  }

  async function criarLista() {
    const nome = nomeLista.trim();
    if (!nome || !quadro) {
      setCriandoLista(false);
      return;
    }
    const posicao = posicaoEntre(listas.at(-1)?.posicao ?? null, null);
    const { data, error } = await supabase
      .from("kanban_listas")
      .insert({ quadro_id: quadro.id, nome, posicao })
      .select()
      .single();
    if (error) {
      alert("Erro ao criar lista: " + error.message);
      return;
    }
    setListas((v) => [...v, data as KanbanLista]);
    setNomeLista("");
    setCriandoLista(false);
  }

  async function renomearLista(id: string, nome: string) {
    setListas((v) => v.map((l) => (l.id === id ? { ...l, nome } : l)));
    await supabase.from("kanban_listas").update({ nome }).eq("id", id);
  }

  async function arquivarLista(id: string) {
    setListas((v) => v.filter((l) => l.id !== id));
    await supabase.from("kanban_listas").update({ arquivada: true }).eq("id", id);
  }

  const totalCartoes = cartoes.length;

  /**
   * Só o gestor DA ÁREA do quadro personaliza (regra combinada com o time).
   * Isto aqui é só pra esconder o botão — quem impede de verdade é a RLS no
   * banco, então mexer no HTML pelo navegador não libera nada.
   */
  const podeAdministrar = (() => {
    if (!quadro || !gcAtual) return false;
    if (nivelAcessoDoCargo(gcAtual.cargo) !== "gestor") return false;
    if (!quadro.area) return true; // quadro geral: qualquer gestor
    return CARGOS.find((c) => c.label === gcAtual.cargo)?.area === quadro.area;
  })();

  async function salvarQuadro(patch: Partial<KanbanQuadro>) {
    if (!quadro) return;
    setQuadro({ ...quadro, ...patch } as KanbanQuadro);
    setQuadros((v) => v.map((q) => (q.id === quadro.id ? ({ ...q, ...patch } as KanbanQuadro) : q)));
    const { error } = await supabase.from("kanban_quadros").update(patch).eq("id", quadro.id);
    if (error) alert("Não foi possível salvar: " + error.message);
  }

  function trocarQuadro(id: string) {
    quadroIdRef.current = id;
    setCarregando(true);
    setPersonalizando(false);
    setChave((k) => k + 1);
  }

  const fundo = estiloDeFundo(quadro?.imagem_capa ?? null);
  // Foto precisa de véu escuro pra não competir com o texto dos cartões;
  // gradiente pronto já nasce com contraste controlado e dispensa.
  const fundoEhFoto = Boolean(quadro?.imagem_capa && !quadro.imagem_capa.startsWith("preset:"));

  return (
    <div
      className={`max-w-full w-full px-4 sm:px-6 py-6 flex flex-col gap-4 h-full ${
        fundo ? "" : "bg-background"
      }`}
      style={
        fundo
          ? {
              backgroundImage: fundoEhFoto
                ? `linear-gradient(rgba(21,6,56,.55), rgba(21,6,56,.55)), ${fundo}`
                : fundo,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "fixed",
            }
          : undefined
      }
    >
      {/* Faixa do quadro: cor do tema é a identidade que cada diretoria dá ao
          espaço dela. Quando há fundo, a faixa fica translúcida pra ele
          aparecer atrás. */}
      {quadro && (
        <div
          className={`rounded-xl overflow-hidden ${
            fundo ? "bg-navy/35 backdrop-blur-sm" : classeTemaQuadro(quadro.cor_tema)
          }`}
        >
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
            {quadros.map((q) => (
              <button
                key={q.id}
                onClick={() => trocarQuadro(q.id)}
                className={`text-sm font-semibold px-3 py-1.5 rounded-md transition-colors ${
                  q.id === quadro.id
                    ? "bg-white/95 text-navy"
                    : "text-white/75 hover:text-white hover:bg-white/15"
                }`}
              >
                {q.nome}
              </button>
            ))}

            {podeAdministrar && (
              <button
                onClick={() => setPersonalizando((v) => !v)}
                className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-white/80 hover:text-white hover:bg-white/15 px-3 py-1.5 rounded-md"
                title="Personalizar este quadro"
              >
                <Settings2 size={14} /> Personalizar
              </button>
            )}
          </div>

          {personalizando && quadro && (
            <div className="bg-white/95 px-4 py-3 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-navy/50 uppercase tracking-wide">Nome</label>
                <input
                  defaultValue={quadro.nome}
                  onBlur={(e) => {
                    const n = e.target.value.trim();
                    if (n && n !== quadro.nome) salvarQuadro({ nome: n });
                  }}
                  className="text-sm border border-navy/15 rounded-md px-2 py-1 flex-1 min-w-40"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold text-navy/50 uppercase tracking-wide">Cor</label>
                {TEMAS_QUADRO.map((t) => (
                  <button
                    key={t.cor}
                    onClick={() => salvarQuadro({ cor_tema: t.cor })}
                    title={t.label}
                    aria-label={`Tema ${t.label}`}
                    className={`w-6 h-6 rounded-full ${t.classe} ${
                      quadro.cor_tema === t.cor ? "ring-2 ring-offset-2 ring-navy" : ""
                    }`}
                  />
                ))}
              </div>

              <FundoQuadro
                valorAtual={quadro.imagem_capa}
                onEscolher={(valor) => salvarQuadro({ imagem_capa: valor })}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="titulo-pagina flex items-center gap-2">
            <Columns3 size={20} className="text-red" />
            {quadro?.nome ?? "Kanban"}
            {quadro?.area && (
              <span className="text-xs font-semibold text-navy/45 bg-navy/8 px-2 py-0.5 rounded-full">
                {quadro.area}
              </span>
            )}
          </h1>
          <p className="text-sm text-navy/60">
            {carregando
              ? "Carregando..."
              : filtrando
                ? `${cartoesVisiveis.length} de ${totalCartoes} cartões`
                : `${totalCartoes} cartões · ${listas.length} listas`}
          </p>
        </div>

        {!carregando && !erro && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy/35" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cartão..."
                className="text-sm border border-navy/15 rounded-md pl-8 pr-2 py-1.5 w-48 bg-white"
              />
            </div>

            <select
              value={filtroEtiqueta ?? ""}
              onChange={(e) => setFiltroEtiqueta(e.target.value || null)}
              aria-label="Filtrar por etiqueta"
              className="text-sm border border-navy/15 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="">Todas as etiquetas</option>
              {etiquetas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>

            <select
              value={filtroMembro ?? ""}
              onChange={(e) => setFiltroMembro(e.target.value || null)}
              aria-label="Filtrar por responsável"
              className="text-sm border border-navy/15 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="">Todos</option>
              {gcs.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>

            {filtrando && (
              <button
                onClick={() => {
                  setBusca("");
                  setFiltroEtiqueta(null);
                  setFiltroMembro(null);
                }}
                className="flex items-center gap-1 text-sm font-semibold text-navy/60 hover:text-navy px-2 py-1.5"
              >
                <X size={14} /> Limpar
              </button>
            )}
          </div>
        )}
      </div>

      {erro && (
        <div className="bg-white rounded-lg border border-red/30 p-4">
          <p className="text-sm font-semibold text-navy">Não foi possível abrir o quadro</p>
          <p className="text-sm text-navy/60 mt-0.5">{erro}</p>
        </div>
      )}

      {carregando && (
        <div className="flex items-center gap-2 text-navy/50 text-sm py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Carregando o quadro...
        </div>
      )}

      {/* closestCorners: com listas verticais, é a detecção que acerta o alvo
          certo ao arrastar entre colunas — o padrão erra quando o cartão passa
          por cima de outra lista no caminho. */}
      {!carregando && !erro && (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={aoSoltar}>
          <div className="flex-1 overflow-x-auto pb-4">
            <div className="flex gap-3 items-start min-w-min h-full">
              {listas.map((l) => (
                <ListaKanban
                  key={l.id}
                  lista={l}
                  cartoes={porListaVisivel.get(l.id) ?? []}
                  onAbrirCartao={setAberto}
                  onCriarCartao={criarCartao}
                  onRenomear={renomearLista}
                  onArquivar={arquivarLista}
                />
              ))}

              <div className="w-72 shrink-0">
                {criandoLista ? (
                  <div className="bg-navy/[0.04] rounded-xl border border-navy/5 p-2 flex flex-col gap-1.5">
                    <input
                      autoFocus
                      value={nomeLista}
                      onChange={(e) => setNomeLista(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") criarLista();
                        if (e.key === "Escape") setCriandoLista(false);
                      }}
                      placeholder="Nome da lista..."
                      className="text-sm border border-navy/20 rounded-md px-2 py-1.5 bg-white"
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={criarLista}
                        className="text-sm font-semibold bg-navy text-white px-3 py-1 rounded-md"
                      >
                        Adicionar
                      </button>
                      <button
                        onClick={() => setCriandoLista(false)}
                        className="p-1.5 text-navy/50"
                        aria-label="Cancelar"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setCriandoLista(true)}
                    className="w-full flex items-center gap-1.5 text-sm font-semibold text-navy/50 hover:text-navy bg-navy/[0.04] hover:bg-navy/[0.07] rounded-xl px-3 py-2.5 transition-colors"
                  >
                    <Plus size={16} /> Adicionar lista
                  </button>
                )}
              </div>
            </div>
          </div>
        </DndContext>
      )}

      {aberto && (
        <CartaoModal
          cartao={aberto}
          etiquetasDoQuadro={etiquetas}
          gcs={gcs}
          onFechar={() => setAberto(null)}
          onMudou={recarregar}
        />
      )}
    </div>
  );
}
