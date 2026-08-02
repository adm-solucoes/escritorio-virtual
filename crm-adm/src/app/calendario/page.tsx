"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Video,
  ExternalLink,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
} from "lucide-react";
import type { EventoAgendaEquipe, ParticipanteAgenda } from "@/app/api/calendario/eventos/route";

/** Paleta CATEGÓRICA (não é status) — cor é só a identidade de cada pessoa na
 * grade, igual ao papel que a cor de cada agenda tem no Google Calendar. Os
 * dois primeiros reaproveitam os tokens da marca; os demais são intencionalmente
 * fora da marca pra dar variedade visual entre pessoas, mas escolhidos/ajustados
 * (ex: amber-700 em vez de amber-500) pra manter texto branco em cima com
 * contraste >=4.5:1. */
const PALETA_CORES = [
  { bg: "bg-blue", texto: "text-white", dot: "bg-blue" },
  { bg: "bg-red", texto: "text-white", dot: "bg-red" },
  { bg: "bg-green-700", texto: "text-white", dot: "bg-green-700" },
  { bg: "bg-amber-700", texto: "text-white", dot: "bg-amber-700" },
  { bg: "bg-purple-700", texto: "text-white", dot: "bg-purple-700" },
  { bg: "bg-pink-700", texto: "text-white", dot: "bg-pink-700" },
];

function corPorNome(nome: string) {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  return PALETA_CORES[Math.abs(hash) % PALETA_CORES.length];
}

const ALTURA_HORA = 56; // px por hora na grade
const HORA_MIN_PADRAO = 7;
const HORA_MAX_PADRAO = 20;

function inicioDoDia(d: Date) {
  const copia = new Date(d);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function horaFracionaria(d: Date) {
  return d.getHours() + d.getMinutes() / 60;
}

function mesmoDia(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function paraInputTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function combinarDiaHora(dia: Date, horaTexto: string) {
  const [h, m] = horaTexto.split(":").map(Number);
  const resultado = new Date(dia);
  resultado.setHours(h || 0, m || 0, 0, 0);
  return resultado;
}

interface EventoPosicionado extends EventoAgendaEquipe {
  coluna: number;
  totalColunas: number;
}

/** Empacota eventos que se sobrepõem lado a lado (igual à grade semanal do
 * Google Calendar) — algoritmo guloso, não é coloração ótima de intervalos,
 * mas pra agenda de uma equipe pequena o resultado visual é o mesmo. */
function empacotarEventos(eventosDoDia: EventoAgendaEquipe[]): EventoPosicionado[] {
  const ordenados = [...eventosDoDia].sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  const finalDasColunas: number[] = [];
  const posicionados: EventoPosicionado[] = [];

  for (const evento of ordenados) {
    const inicio = new Date(evento.inicio).getTime();
    const fim = new Date(evento.fim).getTime();
    let coluna = finalDasColunas.findIndex((fimColuna) => fimColuna <= inicio);
    if (coluna === -1) {
      coluna = finalDasColunas.length;
      finalDasColunas.push(fim);
    } else {
      finalDasColunas[coluna] = fim;
    }
    posicionados.push({ ...evento, coluna, totalColunas: 1 });
  }

  const totalColunas = finalDasColunas.length || 1;
  return posicionados.map((e) => ({ ...e, totalColunas }));
}

type ModalState =
  | { tipo: "detalhe"; evento: EventoAgendaEquipe }
  | { tipo: "criar"; dia: Date; inicioSugerido: Date; fimSugerido: Date }
  | null;

export default function CalendarioPage() {
  const [offsetSemana, setOffsetSemana] = useState(0);
  const [eventos, setEventos] = useState<EventoAgendaEquipe[]>([]);
  const [participantes, setParticipantes] = useState<ParticipanteAgenda[]>([]);
  const [totalCompartilhando, setTotalCompartilhando] = useState(0);
  const [erros, setErros] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(new Date());
  const [modal, setModal] = useState<ModalState>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState<string | null>(null);
  // Filtro por pessoa: gcIds ESCONDIDOS. Vazio = sem filtro, mostra todo
  // mundo (padrão) — clicar num chip da legenda esconde/mostra só aquela pessoa.
  const [pessoasOcultas, setPessoasOcultas] = useState<Set<string>>(new Set());

  const dias = useMemo(() => {
    const hoje = inicioDoDia(new Date());
    const inicioSemana = new Date(hoje.getTime() + offsetSemana * 7 * 86_400_000);
    return Array.from({ length: 7 }, (_, i) => new Date(inicioSemana.getTime() + i * 86_400_000));
  }, [offsetSemana]);

  const carregar = useCallback(() => {
    const inicio = dias[0].toISOString();
    const fim = new Date(dias[6].getTime() + 86_400_000).toISOString();
    fetch(`/api/calendario/eventos?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setErro(d.error);
        } else {
          setErro(null);
          setEventos(d.eventos ?? []);
          setParticipantes(d.participantes ?? []);
          setTotalCompartilhando(d.totalCompartilhando ?? 0);
          setErros(d.erros ?? []);
        }
        setLoading(false);
      })
      .catch(() => {
        setErro("Erro ao carregar a agenda.");
        setLoading(false);
      });
  }, [dias]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Linha do "agora" (vermelha, igual ao Google Calendar) — atualiza a cada minuto.
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const eventosFiltrados = useMemo(
    () => (pessoasOcultas.size === 0 ? eventos : eventos.filter((e) => !pessoasOcultas.has(e.gcId))),
    [eventos, pessoasOcultas]
  );

  const eventosPorDia = useMemo(() => {
    const mapa = new Map<number, EventoAgendaEquipe[]>();
    for (const dia of dias) mapa.set(dia.getTime(), []);
    for (const evento of eventosFiltrados) {
      const chave = inicioDoDia(new Date(evento.inicio)).getTime();
      const lista = mapa.get(chave);
      if (lista) lista.push(evento);
    }
    return mapa;
  }, [eventosFiltrados, dias]);

  const { horaInicio, horaFim } = useMemo(() => {
    if (eventosFiltrados.length === 0) return { horaInicio: HORA_MIN_PADRAO, horaFim: HORA_MAX_PADRAO };
    let min = HORA_MIN_PADRAO;
    let max = HORA_MAX_PADRAO;
    for (const evento of eventosFiltrados) {
      min = Math.min(min, Math.floor(horaFracionaria(new Date(evento.inicio))));
      max = Math.max(max, Math.ceil(horaFracionaria(new Date(evento.fim))));
    }
    return { horaInicio: Math.max(0, min), horaFim: Math.min(24, max) };
  }, [eventosFiltrados]);

  const horas = useMemo(
    () => Array.from({ length: horaFim - horaInicio }, (_, i) => horaInicio + i),
    [horaInicio, horaFim]
  );

  function alternarFiltroPessoa(gcId: string) {
    setPessoasOcultas((atual) => {
      const novo = new Set(atual);
      if (novo.has(gcId)) novo.delete(gcId);
      else novo.add(gcId);
      return novo;
    });
  }

  const alturaGrade = (horaFim - horaInicio) * ALTURA_HORA;

  /* --- Arrastar pra remarcar (só verticalmente, dentro do mesmo dia) --- */
  const arrastoRef = useRef<{ eventoId: string; startY: number; moveu: boolean } | null>(null);
  const [arrastoDeltaY, setArrastoDeltaY] = useState<{ eventoId: string; deltaY: number } | null>(null);

  function abrirDetalhe(evento: EventoAgendaEquipe) {
    setErroModal(null);
    setModal({ tipo: "detalhe", evento });
  }

  // Arrastar pra remarcar só faz sentido com mouse — em touch, "touch-action:
  // none" (necessário pra não brigar com o scroll da página durante o
  // arrasto) desligava a rolagem inteira sempre que o dedo encostava num
  // compromisso pra rolar a tela. Em toque, o toque só abre o detalhe.
  function iniciarArrasto(e: React.PointerEvent<HTMLDivElement>, eventoId: string) {
    e.stopPropagation();
    if (e.pointerType !== "mouse") return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    arrastoRef.current = { eventoId, startY: e.clientY, moveu: false };
  }

  function moverArrasto(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    const a = arrastoRef.current;
    if (!a) return;
    const deltaY = e.clientY - a.startY;
    if (Math.abs(deltaY) > 4) a.moveu = true;
    setArrastoDeltaY({ eventoId: a.eventoId, deltaY });
  }

  async function soltarArrasto(e: React.PointerEvent<HTMLDivElement>, evento: EventoAgendaEquipe) {
    if (e.pointerType !== "mouse") {
      abrirDetalhe(evento);
      return;
    }

    const a = arrastoRef.current;
    arrastoRef.current = null;
    setArrastoDeltaY(null);
    if (!a) return;

    if (!a.moveu) {
      abrirDetalhe(evento);
      return;
    }

    const deltaY = e.clientY - a.startY;
    const deltaMinutos = Math.round((deltaY / ALTURA_HORA) * 60 / 15) * 15;
    if (deltaMinutos === 0) return;

    const novoInicio = new Date(new Date(evento.inicio).getTime() + deltaMinutos * 60_000);
    const novoFim = new Date(new Date(evento.fim).getTime() + deltaMinutos * 60_000);

    setEventos((atual) =>
      atual.map((ev) => (ev.id === evento.id ? { ...ev, inicio: novoInicio.toISOString(), fim: novoFim.toISOString() } : ev))
    );

    await fetch(`/api/calendario/eventos/${encodeURIComponent(evento.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gcId: evento.gcId, inicioISO: novoInicio.toISOString(), fimISO: novoFim.toISOString() }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setErro(`Não deu pra remarcar: ${d.error}`);
          carregar();
        }
      })
      .catch(() => {
        setErro("Não deu pra remarcar — erro de conexão.");
        carregar();
      });
  }

  function cliqueColuna(e: React.MouseEvent<HTMLDivElement>, dia: Date) {
    if (participantes.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    let horaClicada = horaInicio + offsetY / ALTURA_HORA;
    horaClicada = Math.round(horaClicada * 2) / 2; // snap de 30min
    const inicioSugerido = new Date(dia);
    const horasInt = Math.floor(horaClicada);
    const minutos = (horaClicada - horasInt) * 60;
    inicioSugerido.setHours(horasInt, minutos, 0, 0);
    const fimSugerido = new Date(inicioSugerido.getTime() + 60 * 60_000);
    setErroModal(null);
    setModal({ tipo: "criar", dia, inicioSugerido, fimSugerido });
  }

  async function salvarDetalhe(evento: EventoAgendaEquipe, titulo: string, horaIni: string, horaF: string) {
    setSalvando(true);
    setErroModal(null);
    const dia = inicioDoDia(new Date(evento.inicio));
    const inicioISO = combinarDiaHora(dia, horaIni).toISOString();
    const fimISO = combinarDiaHora(dia, horaF).toISOString();

    const r = await fetch(`/api/calendario/eventos/${encodeURIComponent(evento.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gcId: evento.gcId, titulo, inicioISO, fimISO }),
    }).then((res) => res.json());

    setSalvando(false);
    if (r.error) {
      setErroModal(r.error);
      return;
    }
    setModal(null);
    carregar();
  }

  async function excluir(evento: EventoAgendaEquipe) {
    setSalvando(true);
    setErroModal(null);
    const r = await fetch(
      `/api/calendario/eventos/${encodeURIComponent(evento.id)}?gcId=${encodeURIComponent(evento.gcId)}`,
      { method: "DELETE" }
    ).then((res) => res.json());
    setSalvando(false);
    if (r.error) {
      setErroModal(r.error);
      return;
    }
    setModal(null);
    carregar();
  }

  async function criarEvento(gcId: string, titulo: string, dia: Date, horaIni: string, horaF: string) {
    setSalvando(true);
    setErroModal(null);
    const inicioISO = combinarDiaHora(dia, horaIni).toISOString();
    const fimISO = combinarDiaHora(dia, horaF).toISOString();

    const r = await fetch("/api/calendario/eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gcId, titulo, inicioISO, fimISO }),
    }).then((res) => res.json());

    setSalvando(false);
    if (r.error) {
      setErroModal(r.error);
      return;
    }
    setModal(null);
    carregar();
  }

  const rotuloSemana = `${dias[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${dias[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="titulo-pagina flex items-center gap-2">
            <CalendarDays size={20} /> Agenda da equipe
          </h1>
          <p className="text-sm text-navy/60">
            De quem ativou o compartilhamento em{" "}
            <Link href="/configuracoes" className="underline">
              Configurações
            </Link>
            . {totalCompartilhando > 0 && `${totalCompartilhando} pessoa(s) compartilhando agora.`}
          </p>
        </div>

        {participantes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {participantes.map((p) => {
              const cor = corPorNome(p.nome);
              const oculta = pessoasOcultas.has(p.gcId);
              return (
                <button
                  key={p.gcId}
                  onClick={() => alternarFiltroPessoa(p.gcId)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full border transition ${
                    oculta ? "border-navy/15 text-navy/30" : "border-navy/15 text-navy/70 bg-navy/[0.02]"
                  }`}
                  title={oculta ? "Clique pra mostrar de novo" : "Clique pra esconder"}
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${cor.dot} ${oculta ? "opacity-30" : ""}`} />
                  {p.nome}
                </button>
              );
            })}
            {pessoasOcultas.size > 0 && (
              <button onClick={() => setPessoasOcultas(new Set())} className="text-xs text-navy/40 underline hover:text-navy/60">
                mostrar todos
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setLoading(true);
            setOffsetSemana((v) => v - 1);
          }}
          className="p-1.5 rounded-md hover:bg-navy/5 text-navy/60"
          aria-label="Semana anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => {
            setLoading(true);
            setOffsetSemana((v) => v + 1);
          }}
          className="p-1.5 rounded-md hover:bg-navy/5 text-navy/60"
          aria-label="Próxima semana"
        >
          <ChevronRight size={18} />
        </button>
        {offsetSemana !== 0 && (
          <button
            onClick={() => {
              setLoading(true);
              setOffsetSemana(0);
            }}
            className="px-2.5 py-1 rounded-md text-xs font-semibold bg-navy/5 text-navy/70 hover:bg-navy/10"
          >
            Hoje
          </button>
        )}
        <span className="text-sm font-semibold text-navy ml-1">{rotuloSemana}</span>
      </div>

      {erros.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-warning bg-warning-bg border border-warning/25 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{erros.join(" · ")}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-navy/15 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-navy/50">Carregando...</p>
        ) : erro ? (
          <p className="p-6 text-sm text-red">{erro}</p>
        ) : totalCompartilhando === 0 ? (
          <p className="p-6 text-sm text-navy/50">
            Ninguém ativou o compartilhamento da agenda ainda — ative em{" "}
            <Link href="/configuracoes" className="underline">
              Configurações
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              {eventosFiltrados.length === 0 && (
                <p className="px-4 pt-3 text-xs text-navy/40">
                  {pessoasOcultas.size > 0 ? "Nenhum compromisso visível com o filtro atual." : "Nenhum compromisso nesta semana."}
                </p>
              )}
              {/* Cabeçalho: dias da semana, dia atual destacado igual ao Google Calendar */}
              <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-navy/15">
                <div />
                {dias.map((dia) => {
                  const hoje = mesmoDia(dia, new Date());
                  return (
                    <div key={dia.toISOString()} className="py-3 text-center border-l border-navy/5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-navy/40">
                        {dia.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                      </p>
                      <p
                        className={`mt-1 inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                          hoje ? "bg-red text-white" : "text-navy"
                        }`}
                      >
                        {dia.getDate()}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Grade de horários */}
              <div className="grid grid-cols-[56px_repeat(7,1fr)] relative">
                {/* Coluna de horas */}
                <div>
                  {horas.map((h) => (
                    <div key={h} style={{ height: ALTURA_HORA }} className="relative">
                      <span className="absolute -top-2 right-2 text-[11px] text-navy/40 tabular-nums">
                        {String(h).padStart(2, "0")}:00
                      </span>
                    </div>
                  ))}
                </div>

                {/* Colunas dos dias */}
                {dias.map((dia) => {
                  const eventosDoDia = eventosPorDia.get(dia.getTime()) ?? [];
                  const empacotados = empacotarEventos(eventosDoDia);
                  const ehHoje = mesmoDia(dia, agora);
                  const offsetAgoraPx = ehHoje ? (horaFracionaria(agora) - horaInicio) * ALTURA_HORA : null;

                  return (
                    <div
                      key={dia.toISOString()}
                      onClick={(e) => cliqueColuna(e, dia)}
                      className="relative border-l border-navy/5 cursor-pointer"
                      style={{ height: alturaGrade }}
                      title="Clique pra criar um compromisso"
                    >
                      {horas.map((h) => (
                        <div key={h} className="border-t border-navy/5" style={{ height: ALTURA_HORA }} />
                      ))}

                      {offsetAgoraPx !== null && offsetAgoraPx >= 0 && offsetAgoraPx <= alturaGrade && (
                        <div
                          className="absolute left-0 right-0 flex items-center gap-1 z-20 pointer-events-none"
                          style={{ top: offsetAgoraPx }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-red -ml-0.75" />
                          <span className="flex-1 h-px bg-red" />
                        </div>
                      )}

                      {empacotados.map((evento) => {
                        const inicio = new Date(evento.inicio);
                        const fim = new Date(evento.fim);
                        const topPx = Math.max(0, (horaFracionaria(inicio) - horaInicio) * ALTURA_HORA);
                        const alturaPx = Math.max(20, (horaFracionaria(fim) - horaFracionaria(inicio)) * ALTURA_HORA);
                        const larguraPct = 100 / evento.totalColunas;
                        const cor = corPorNome(evento.gcNome);
                        const arrastandoEste = arrastoDeltaY?.eventoId === evento.id;

                        return (
                          <div
                            key={evento.id}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => iniciarArrasto(e, evento.id)}
                            onPointerMove={moverArrasto}
                            onPointerUp={(e) => soltarArrasto(e, evento)}
                            className="absolute z-10 px-1"
                            style={{
                              top: topPx,
                              height: alturaPx,
                              left: `${evento.coluna * larguraPct}%`,
                              width: `${larguraPct}%`,
                              transform: arrastandoEste ? `translateY(${arrastoDeltaY!.deltaY}px)` : undefined,
                              zIndex: arrastandoEste ? 30 : 10,
                            }}
                          >
                            <div
                              title={`${evento.titulo} — ${evento.gcNome} (arraste pra remarcar, clique pra ver detalhes)`}
                              className={`h-full w-full rounded-md px-1.5 py-1 overflow-hidden cursor-grab active:cursor-grabbing ${cor.bg} ${cor.texto} ${arrastandoEste ? "shadow-lg" : "hover:brightness-110"} transition`}
                            >
                              <p className="text-[11px] font-semibold leading-tight truncate">
                                {inicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {evento.titulo}
                              </p>
                              <p className="text-[10px] opacity-80 truncate flex items-center gap-1">
                                {evento.gcNome}
                                {evento.linkChamada && <Video size={10} />}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {!loading && !erro && totalCompartilhando > 0 && (
        <p className="text-[11px] text-navy/40 flex items-center gap-1 justify-end">
          <ExternalLink size={11} /> Clique num compromisso pra ver detalhes, arraste pra remarcar, ou clique num horário vazio pra criar.
        </p>
      )}

      {modal?.tipo === "detalhe" && (
        <ModalDetalheEvento
          evento={modal.evento}
          salvando={salvando}
          erro={erroModal}
          onFechar={() => setModal(null)}
          onSalvar={salvarDetalhe}
          onExcluir={excluir}
        />
      )}

      {modal?.tipo === "criar" && (
        <ModalCriarEvento
          dia={modal.dia}
          inicioSugerido={modal.inicioSugerido}
          fimSugerido={modal.fimSugerido}
          participantes={participantes}
          salvando={salvando}
          erro={erroModal}
          onFechar={() => setModal(null)}
          onCriar={criarEvento}
        />
      )}
    </div>
  );
}

function ModalDetalheEvento({
  evento,
  salvando,
  erro,
  onFechar,
  onSalvar,
  onExcluir,
}: {
  evento: EventoAgendaEquipe;
  salvando: boolean;
  erro: string | null;
  onFechar: () => void;
  onSalvar: (evento: EventoAgendaEquipe, titulo: string, horaIni: string, horaF: string) => void;
  onExcluir: (evento: EventoAgendaEquipe) => void;
}) {
  const [titulo, setTitulo] = useState(evento.titulo);
  const [horaIni, setHoraIni] = useState(paraInputTime(new Date(evento.inicio)));
  const [horaF, setHoraF] = useState(paraInputTime(new Date(evento.fim)));
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const dia = new Date(evento.inicio).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="fixed inset-0 bg-navy/40 flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold text-navy/50 uppercase tracking-wide">{dia}</p>
          <button onClick={onFechar} className="text-navy/40 hover:text-navy p-1" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <input
          className="input text-sm font-semibold"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título"
        />

        <div className="flex items-center gap-2">
          <input type="time" className="input text-sm" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} />
          <span className="text-navy/40 text-sm">até</span>
          <input type="time" className="input text-sm" value={horaF} onChange={(e) => setHoraF(e.target.value)} />
        </div>

        <p className="text-xs text-navy/50">Consultor: {evento.gcNome}</p>

        {(evento.linkChamada || evento.linkEvento) && (
          <div className="flex gap-3 text-xs">
            {evento.linkChamada && (
              <a href={evento.linkChamada} target="_blank" rel="noopener noreferrer" className="text-blue hover:underline flex items-center gap-1">
                <Video size={12} /> Entrar na chamada
              </a>
            )}
            {evento.linkEvento && (
              <a href={evento.linkEvento} target="_blank" rel="noopener noreferrer" className="text-navy/50 hover:text-navy flex items-center gap-1">
                <ExternalLink size={12} /> Abrir no Google Calendar
              </a>
            )}
          </div>
        )}

        {erro && <p className="text-xs text-red">{erro}</p>}

        <div className="flex items-center justify-between gap-2 mt-1">
          {confirmandoExclusao ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-navy/60">Excluir de vez?</span>
              <button
                onClick={() => onExcluir(evento)}
                disabled={salvando}
                className="px-2 py-1 rounded-md bg-red text-white font-semibold disabled:opacity-50"
              >
                Confirmar
              </button>
              <button onClick={() => setConfirmandoExclusao(false)} className="px-2 py-1 rounded-md text-navy/60">
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmandoExclusao(true)}
              className="text-xs text-red/70 hover:text-red flex items-center gap-1"
            >
              <Trash2 size={13} /> Excluir
            </button>
          )}

          <button
            onClick={() => onSalvar(evento, titulo, horaIni, horaF)}
            disabled={salvando || !titulo.trim()}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-navy text-cream disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalCriarEvento({
  dia,
  inicioSugerido,
  fimSugerido,
  participantes,
  salvando,
  erro,
  onFechar,
  onCriar,
}: {
  dia: Date;
  inicioSugerido: Date;
  fimSugerido: Date;
  participantes: ParticipanteAgenda[];
  salvando: boolean;
  erro: string | null;
  onFechar: () => void;
  onCriar: (gcId: string, titulo: string, dia: Date, horaIni: string, horaF: string) => void;
}) {
  const [gcId, setGcId] = useState(participantes[0]?.gcId ?? "");
  const [titulo, setTitulo] = useState("");
  const [horaIni, setHoraIni] = useState(paraInputTime(inicioSugerido));
  const [horaF, setHoraF] = useState(paraInputTime(fimSugerido));
  const rotuloDia = dia.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="fixed inset-0 bg-navy/40 flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold text-navy/50 uppercase tracking-wide">Novo compromisso — {rotuloDia}</p>
          <button onClick={onFechar} className="text-navy/40 hover:text-navy p-1" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <input
          className="input text-sm font-semibold"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título do compromisso"
          autoFocus
        />

        <select className="input text-sm" value={gcId} onChange={(e) => setGcId(e.target.value)}>
          {participantes.map((p) => (
            <option key={p.gcId} value={p.gcId}>
              {p.nome}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <input type="time" className="input text-sm" value={horaIni} onChange={(e) => setHoraIni(e.target.value)} />
          <span className="text-navy/40 text-sm">até</span>
          <input type="time" className="input text-sm" value={horaF} onChange={(e) => setHoraF(e.target.value)} />
        </div>

        {erro && <p className="text-xs text-red">{erro}</p>}

        <div className="flex items-center justify-end gap-2 mt-1">
          <button onClick={onFechar} className="px-3 py-1.5 rounded-md text-xs font-semibold text-navy/60">
            Cancelar
          </button>
          <button
            onClick={() => onCriar(gcId, titulo, dia, horaIni, horaF)}
            disabled={salvando || !titulo.trim() || !gcId}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-navy text-cream disabled:opacity-50"
          >
            Criar
          </button>
        </div>
      </div>
    </div>
  );
}
