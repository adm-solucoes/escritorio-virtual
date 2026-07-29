"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Phone,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  MessageCircleMore,
  Wallet,
  ExternalLink,
  Download,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type SaldoApi = { disponivel: boolean; valor?: string; moeda?: string; erro?: string; painel?: string };
type SaldoResposta = { twilio: SaldoApi; deepgram: SaldoApi; groq: SaldoApi; cartesia: SaldoApi };

const NOMES_API: Record<keyof SaldoResposta, string> = {
  twilio: "Twilio",
  deepgram: "Deepgram",
  groq: "Groq",
  cartesia: "Cartesia",
};

type EmpresaProspect = {
  id: string;
  nome_empresa: string;
  nome_contato: string | null;
  telefone: string | null;
  data_cadastro: string | null;
  criado_em: string;
};

type StatusContato = "nunca_ligado" | "interessado" | "sem_interesse";

const LABEL_STATUS: Record<StatusContato, string> = {
  nunca_ligado: "Nunca ligado",
  interessado: "Ligado — interessado",
  sem_interesse: "Ligado — sem interesse / não deu retorno",
};

type LigacaoAgenteVoz = {
  id: string;
  call_id: string;
  telefone: string;
  empresa_id: string | null;
  interessado: boolean | null;
  motivo_recusa: string | null;
  melhor_horario_retorno: string | null;
  resumo: string | null;
  transcricao_completa: string | null;
  trigger_whatsapp_followup: boolean;
  evento_calendario_link: string | null;
  criado_em: string;
  empresas: { nome_empresa: string } | null;
};

export default function AgenteVozPage() {
  const [aba, setAba] = useState<"ligacoes" | "prospects">("ligacoes");
  const [ligacoes, setLigacoes] = useState<LigacaoAgenteVoz[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [saldos, setSaldos] = useState<SaldoResposta | null>(null);
  const [carregandoSaldos, setCarregandoSaldos] = useState(true);

  const [empresas, setEmpresas] = useState<EmpresaProspect[]>([]);
  const [loadingProspects, setLoadingProspects] = useState(true);
  const [filtroData, setFiltroData] = useState(""); // cadastradas a partir desta data
  const [filtroStatus, setFiltroStatus] = useState<StatusContato | "todos">("nunca_ligado");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("ligacoes_agente_voz")
      .select("*, empresas(nome_empresa)")
      .order("criado_em", { ascending: false })
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) console.error("Erro ao carregar ligações do agente de voz:", error.message);
        setLigacoes((data as unknown as LigacaoAgenteVoz[]) ?? []);
        setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/agente-voz/saldo")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelado) setSaldos(j);
      })
      .catch((err) => console.error("Erro ao carregar saldos das APIs:", err))
      .finally(() => {
        if (!cancelado) setCarregandoSaldos(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("empresas")
      .select("id, nome_empresa, nome_contato, telefone, data_cadastro, criado_em")
      .not("telefone", "is", null)
      .order("criado_em", { ascending: false })
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) console.error("Erro ao carregar empresas:", error.message);
        setEmpresas((data as EmpresaProspect[]) ?? []);
        setLoadingProspects(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Status de contato por empresa, derivado da última ligação registrada.
  const statusPorEmpresa = useMemo(() => {
    const mapa = new Map<string, StatusContato>();
    for (const l of ligacoes) {
      if (!l.empresa_id) continue;
      mapa.set(l.empresa_id, l.interessado ? "interessado" : "sem_interesse");
    }
    return mapa;
  }, [ligacoes]);

  const prospectsFiltrados = useMemo(() => {
    return empresas.filter((e) => {
      if (!e.telefone || !/\d/.test(e.telefone)) return false; // ex: "Não identificado"
      const status = statusPorEmpresa.get(e.id) ?? "nunca_ligado";
      if (filtroStatus !== "todos" && status !== filtroStatus) return false;
      if (filtroData) {
        const dataRef = e.data_cadastro ?? e.criado_em;
        if (!dataRef || dataRef.slice(0, 10) < filtroData) return false;
      }
      return true;
    });
  }, [empresas, statusPorEmpresa, filtroStatus, filtroData]);

  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecionarTodos() {
    setSelecionados((prev) =>
      prev.size === prospectsFiltrados.length ? new Set() : new Set(prospectsFiltrados.map((e) => e.id))
    );
  }

  function exportarCsv() {
    const linhas = prospectsFiltrados
      .filter((e) => selecionados.has(e.id))
      .map((e) => `${e.telefone},${(e.nome_contato || e.nome_empresa).replace(/,/g, " ")}`);
    const csv = ["telefone,nome", ...linhas].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospects-agente-voz-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalInteressados = ligacoes.filter((l) => l.interessado).length;

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-navy flex items-center gap-2">
          <Phone size={20} className="text-red" />
          Agente de Voz
        </h1>
        <p className="text-sm text-navy/60">
          {ligacoes.length} ligações registradas · {totalInteressados} com interesse demonstrado
        </p>
      </div>

      <div className="flex gap-1 border-b border-navy/10">
        <button
          onClick={() => setAba("ligacoes")}
          className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            aba === "ligacoes" ? "border-red text-navy" : "border-transparent text-navy/50 hover:text-navy"
          }`}
        >
          Ligações
        </button>
        <button
          onClick={() => setAba("prospects")}
          className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            aba === "prospects" ? "border-red text-navy" : "border-transparent text-navy/50 hover:text-navy"
          }`}
        >
          <Users size={14} /> Prospects pra ligar
        </button>
      </div>

      {aba === "ligacoes" && (
      <div className="bg-white rounded-lg border border-navy/10 p-4">
        <p className="text-xs font-semibold text-navy/60 flex items-center gap-1.5 mb-3">
          <Wallet size={14} /> Saldo das APIs
        </p>
        {carregandoSaldos ? (
          <p className="text-sm text-navy/40">Carregando...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(Object.keys(NOMES_API) as (keyof SaldoResposta)[]).map((chave) => {
              const s = saldos?.[chave];
              return (
                <div key={chave} className="flex flex-col gap-0.5">
                  <span className="text-xs text-navy/50">{NOMES_API[chave]}</span>
                  {s?.disponivel ? (
                    <span className="text-sm font-bold text-navy">
                      {Number(s.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                      {s.moeda?.toUpperCase()}
                    </span>
                  ) : s?.painel ? (
                    <a
                      href={s.painel}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-red font-semibold flex items-center gap-1 hover:underline"
                    >
                      ver no painel <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span className="text-xs text-navy/40">indisponível{s?.erro ? ` (${s.erro})` : ""}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {aba === "ligacoes" && (loading ? (
        <p className="text-sm text-navy/50">Carregando...</p>
      ) : ligacoes.length === 0 ? (
        <div className="bg-white rounded-lg border border-navy/10 p-8 text-center text-sm text-navy/50">
          Nenhuma ligação registrada ainda. Assim que o agente de voz concluir uma ligação, ela aparece aqui
          automaticamente.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ligacoes.map((l) => {
            const expandido = expandidoId === l.id;
            return (
              <div key={l.id} className="bg-white rounded-lg border border-navy/10 overflow-hidden">
                <button
                  onClick={() => setExpandidoId(expandido ? null : l.id)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-navy/[0.02] transition-colors"
                >
                  <div className="mt-0.5 shrink-0">
                    {l.interessado ? (
                      <CheckCircle2 size={18} className="text-green-600" />
                    ) : (
                      <XCircle size={18} className="text-navy/30" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-navy">
                        {l.empresas?.nome_empresa ?? l.telefone}
                      </span>
                      <span className="text-xs text-navy/40">{l.telefone}</span>
                      {l.trigger_whatsapp_followup && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                          <MessageCircleMore size={11} /> follow-up sugerido
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-navy/70 truncate">{l.resumo ?? "(sem resumo)"}</p>
                    {l.evento_calendario_link ? (
                      <a
                        href={l.evento_calendario_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-green-700 font-semibold hover:underline mt-0.5 inline-block"
                      >
                        Briefing agendado — ver no Google Calendar
                      </a>
                    ) : (
                      l.melhor_horario_retorno && (
                        <p className="text-xs text-navy/50 mt-0.5">Melhor horário: {l.melhor_horario_retorno}</p>
                      )
                    )}
                    {!l.interessado && l.motivo_recusa && (
                      <p className="text-xs text-navy/50 mt-0.5">Motivo: {l.motivo_recusa}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1 text-xs text-navy/40">
                    <span>{new Date(l.criado_em).toLocaleString("pt-BR")}</span>
                    {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {expandido && (
                  <div className="border-t border-navy/10 px-4 py-3 bg-navy/[0.015]">
                    <p className="text-xs font-semibold text-navy/60 mb-1.5">Transcrição completa</p>
                    <pre className="text-xs text-navy/70 whitespace-pre-wrap font-sans leading-relaxed">
                      {l.transcricao_completa ?? "(transcrição não disponível)"}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {aba === "prospects" && (
        <div className="flex flex-col gap-3">
          <div className="bg-white rounded-lg border border-navy/10 p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-navy/60">Cadastradas a partir de</label>
              <input
                type="date"
                value={filtroData}
                onChange={(e) => setFiltroData(e.target.value)}
                className="text-sm border border-navy/15 rounded-md px-2 py-1.5"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-navy/60">Status de contato</label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as StatusContato | "todos")}
                className="text-sm border border-navy/15 rounded-md px-2 py-1.5"
              >
                <option value="todos">Todos</option>
                <option value="nunca_ligado">{LABEL_STATUS.nunca_ligado}</option>
                <option value="interessado">{LABEL_STATUS.interessado}</option>
                <option value="sem_interesse">{LABEL_STATUS.sem_interesse}</option>
              </select>
            </div>
            <button
              onClick={exportarCsv}
              disabled={selecionados.size === 0}
              className="flex items-center gap-1.5 text-sm font-semibold bg-red text-white px-3 py-1.5 rounded-md disabled:opacity-40 disabled:cursor-not-allowed sm:ml-auto"
            >
              <Download size={14} /> Exportar CSV ({selecionados.size})
            </button>
          </div>

          <p className="text-xs text-navy/50">
            O CSV exportado (colunas <code>telefone,nome</code>) é compatível com{" "}
            <code>node scripts/batchDial.js</code> no projeto do agente de voz — dispara direto do seu computador,
            já que o servidor de ligação não roda no site hospedado.
          </p>

          {loadingProspects ? (
            <p className="text-sm text-navy/50">Carregando...</p>
          ) : prospectsFiltrados.length === 0 ? (
            <div className="bg-white rounded-lg border border-navy/10 p-8 text-center text-sm text-navy/50">
              Nenhuma empresa encontrada com esses filtros.
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-navy/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy/10 text-left text-xs text-navy/50">
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={selecionados.size === prospectsFiltrados.length}
                        onChange={alternarSelecionarTodos}
                      />
                    </th>
                    <th className="px-3 py-2">Empresa</th>
                    <th className="px-3 py-2">Contato</th>
                    <th className="px-3 py-2">Telefone</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {prospectsFiltrados.map((e) => {
                    const status = statusPorEmpresa.get(e.id) ?? "nunca_ligado";
                    return (
                      <tr key={e.id} className="border-b border-navy/5 last:border-0 hover:bg-navy/[0.02]">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selecionados.has(e.id)}
                            onChange={() => alternarSelecao(e.id)}
                          />
                        </td>
                        <td className="px-3 py-2 font-semibold text-navy">{e.nome_empresa}</td>
                        <td className="px-3 py-2 text-navy/70">{e.nome_contato ?? "—"}</td>
                        <td className="px-3 py-2 text-navy/70">{e.telefone}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                              status === "interessado"
                                ? "text-green-700 bg-green-50"
                                : status === "sem_interesse"
                                ? "text-navy/50 bg-navy/5"
                                : "text-red bg-red/5"
                            }`}
                          >
                            {LABEL_STATUS[status]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
