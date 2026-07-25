"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Video, ExternalLink } from "lucide-react";
import type { EventoAgendaEquipe } from "@/app/api/calendario/eventos/route";

const PALETA_CORES = [
  "bg-blue/10 text-blue",
  "bg-red/10 text-red",
  "bg-green-100 text-green-700",
  "bg-amber-100 text-amber-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
];

function corPorNome(nome: string) {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  return PALETA_CORES[Math.abs(hash) % PALETA_CORES.length];
}

export default function CalendarioPage() {
  const [eventos, setEventos] = useState<EventoAgendaEquipe[]>([]);
  const [totalCompartilhando, setTotalCompartilhando] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

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

  const porDia = useMemo(() => {
    const mapa = new Map<string, EventoAgendaEquipe[]>();
    for (const evento of eventos) {
      const chave = new Date(evento.inicio).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
      const lista = mapa.get(chave) ?? [];
      lista.push(evento);
      mapa.set(chave, lista);
    }
    return Array.from(mapa.entries());
  }, [eventos]);

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-navy flex items-center gap-2">
          <CalendarDays size={20} /> Agenda da equipe
        </h1>
        <p className="text-sm text-navy/60">
          Compromissos dos próximos 7 dias de quem ativou o compartilhamento em{" "}
          <Link href="/configuracoes" className="underline">
            Configurações
          </Link>
          . {totalCompartilhando > 0 && `${totalCompartilhando} pessoa(s) compartilhando agora.`}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-navy/10 shadow-sm">
        {loading ? (
          <p className="p-6 text-sm text-navy/50">Carregando...</p>
        ) : erro ? (
          <p className="p-6 text-sm text-red">{erro}</p>
        ) : eventos.length === 0 ? (
          <p className="p-6 text-sm text-navy/50">
            Nenhum compromisso nos próximos 7 dias — ou ninguém ativou o compartilhamento da agenda ainda.
          </p>
        ) : (
          <div className="divide-y divide-navy/5">
            {porDia.map(([dia, eventosDoDia]) => (
              <div key={dia} className="p-4">
                <p className="text-xs font-bold text-navy/50 uppercase tracking-wide mb-2">{dia}</p>
                <div className="flex flex-col gap-2">
                  {eventosDoDia.map((evento) => (
                    <div key={evento.id} className="flex items-center gap-3 text-sm">
                      <span className="text-navy/50 tabular-nums shrink-0 w-24">
                        {new Date(evento.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        {" – "}
                        {new Date(evento.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${corPorNome(evento.gcNome)}`}>
                        {evento.gcNome}
                      </span>
                      <span className="text-navy flex-1 truncate">{evento.titulo}</span>
                      {evento.linkChamada && (
                        <a
                          href={evento.linkChamada}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue hover:underline shrink-0 flex items-center gap-1"
                          title="Entrar na chamada"
                        >
                          <Video size={13} />
                        </a>
                      )}
                      {evento.linkEvento && (
                        <a
                          href={evento.linkEvento}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-navy/40 hover:text-navy shrink-0"
                          title="Abrir no Google Calendar"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
