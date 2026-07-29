"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Video, ExternalLink, AlertTriangle } from "lucide-react";
import type { EventoAgendaEquipe } from "@/app/api/calendario/eventos/route";

/** Mesma paleta usada antes — cor é a identidade de cada pessoa na grade,
 * igual ao papel que a cor de cada agenda tem no Google Calendar. */
const PALETA_CORES = [
  { bg: "bg-blue", texto: "text-white", dot: "bg-blue" },
  { bg: "bg-red", texto: "text-white", dot: "bg-red" },
  { bg: "bg-green-600", texto: "text-white", dot: "bg-green-600" },
  { bg: "bg-amber-500", texto: "text-white", dot: "bg-amber-500" },
  { bg: "bg-purple-600", texto: "text-white", dot: "bg-purple-600" },
  { bg: "bg-pink-600", texto: "text-white", dot: "bg-pink-600" },
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

export default function CalendarioPage() {
  const [eventos, setEventos] = useState<EventoAgendaEquipe[]>([]);
  const [totalCompartilhando, setTotalCompartilhando] = useState(0);
  const [erros, setErros] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(new Date());

  useEffect(() => {
    let cancelado = false;
    fetch("/api/calendario/eventos")
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return;
        if (d.error) {
          setErro(d.error);
        } else {
          setEventos(d.eventos ?? []);
          setTotalCompartilhando(d.totalCompartilhando ?? 0);
          setErros(d.erros ?? []);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelado) {
          setErro("Erro ao carregar a agenda.");
          setLoading(false);
        }
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Linha do "agora" (vermelha, igual ao Google Calendar) — atualiza a cada minuto.
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const dias = useMemo(() => {
    const hoje = inicioDoDia(new Date());
    return Array.from({ length: 7 }, (_, i) => new Date(hoje.getTime() + i * 86_400_000));
  }, []);

  const eventosPorDia = useMemo(() => {
    const mapa = new Map<number, EventoAgendaEquipe[]>();
    for (const dia of dias) mapa.set(dia.getTime(), []);
    for (const evento of eventos) {
      const chave = inicioDoDia(new Date(evento.inicio)).getTime();
      const lista = mapa.get(chave);
      if (lista) lista.push(evento);
    }
    return mapa;
  }, [eventos, dias]);

  const { horaInicio, horaFim } = useMemo(() => {
    if (eventos.length === 0) return { horaInicio: HORA_MIN_PADRAO, horaFim: HORA_MAX_PADRAO };
    let min = HORA_MIN_PADRAO;
    let max = HORA_MAX_PADRAO;
    for (const evento of eventos) {
      min = Math.min(min, Math.floor(horaFracionaria(new Date(evento.inicio))));
      max = Math.max(max, Math.ceil(horaFracionaria(new Date(evento.fim))));
    }
    return { horaInicio: Math.max(0, min), horaFim: Math.min(24, max) };
  }, [eventos]);

  const horas = useMemo(
    () => Array.from({ length: horaFim - horaInicio }, (_, i) => horaInicio + i),
    [horaInicio, horaFim]
  );

  const pessoas = useMemo(() => {
    const nomes = Array.from(new Set(eventos.map((e) => e.gcNome))).sort();
    return nomes.map((nome) => ({ nome, cor: corPorNome(nome) }));
  }, [eventos]);

  const alturaGrade = (horaFim - horaInicio) * ALTURA_HORA;

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy flex items-center gap-2">
            <CalendarDays size={20} /> Agenda da equipe
          </h1>
          <p className="text-sm text-navy/60">
            Próximos 7 dias de quem ativou o compartilhamento em{" "}
            <Link href="/configuracoes" className="underline">
              Configurações
            </Link>
            . {totalCompartilhando > 0 && `${totalCompartilhando} pessoa(s) compartilhando agora.`}
          </p>
        </div>

        {pessoas.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {pessoas.map((p) => (
              <div key={p.nome} className="flex items-center gap-1.5 text-xs font-medium text-navy/70">
                <span className={`w-2.5 h-2.5 rounded-full ${p.cor.dot}`} />
                {p.nome}
              </div>
            ))}
          </div>
        )}
      </div>

      {erros.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{erros.join(" · ")}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-navy/10 shadow-sm overflow-hidden">
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
              {eventos.length === 0 && (
                <p className="px-4 pt-3 text-xs text-navy/40">Nenhum compromisso nos próximos 7 dias.</p>
              )}
              {/* Cabeçalho: dias da semana, dia atual destacado igual ao Google Calendar */}
              <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-navy/10">
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
                  const offsetAgoraPx = ehHoje
                    ? (horaFracionaria(agora) - horaInicio) * ALTURA_HORA
                    : null;

                  return (
                    <div key={dia.toISOString()} className="relative border-l border-navy/5" style={{ height: alturaGrade }}>
                      {horas.map((h) => (
                        <div key={h} className="border-t border-navy/5" style={{ height: ALTURA_HORA }} />
                      ))}

                      {offsetAgoraPx !== null && offsetAgoraPx >= 0 && offsetAgoraPx <= alturaGrade && (
                        <div className="absolute left-0 right-0 flex items-center gap-1 z-20 pointer-events-none" style={{ top: offsetAgoraPx }}>
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
                        const link = evento.linkChamada ?? evento.linkEvento ?? undefined;

                        const conteudo = (
                          <>
                            <p className="text-[11px] font-semibold leading-tight truncate">
                              {inicio.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {evento.titulo}
                            </p>
                            <p className="text-[10px] opacity-80 truncate flex items-center gap-1">
                              {evento.gcNome}
                              {evento.linkChamada && <Video size={10} />}
                            </p>
                          </>
                        );

                        return (
                          <div
                            key={evento.id}
                            className="absolute z-10 px-1"
                            style={{
                              top: topPx,
                              height: alturaPx,
                              left: `${evento.coluna * larguraPct}%`,
                              width: `${larguraPct}%`,
                            }}
                          >
                            {link ? (
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`${evento.titulo} — ${evento.gcNome}`}
                                className={`block h-full w-full rounded-md px-1.5 py-1 overflow-hidden ${cor.bg} ${cor.texto} hover:brightness-110 transition`}
                              >
                                {conteudo}
                              </a>
                            ) : (
                              <div
                                title={`${evento.titulo} — ${evento.gcNome}`}
                                className={`h-full w-full rounded-md px-1.5 py-1 overflow-hidden ${cor.bg} ${cor.texto}`}
                              >
                                {conteudo}
                              </div>
                            )}
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

      {!loading && !erro && eventos.some((e) => e.linkEvento) && (
        <p className="text-[11px] text-navy/40 flex items-center gap-1 justify-end">
          <ExternalLink size={11} /> Clique num compromisso pra entrar na chamada (ou abrir no Google Calendar quando não tem chamada).
        </p>
      )}
    </div>
  );
}
