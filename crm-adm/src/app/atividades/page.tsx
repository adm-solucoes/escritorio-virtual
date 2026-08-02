"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Pencil, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Atividade, Empresa, Gc, Oportunidade, StatusAtividade } from "@/lib/types";
import AtividadeModal from "@/components/AtividadeModal";
import { Badge, badgeClasses, type BadgeVariant } from "@/components/Badge";

const STATUS_OPCOES: StatusAtividade[] = ["Pendente", "Em andamento", "Concluído", "Atrasado"];

const FILTROS: { label: string; status: StatusAtividade | "Todas" }[] = [
  { label: "Todas", status: "Todas" },
  { label: "Pendente", status: "Pendente" },
  { label: "Em andamento", status: "Em andamento" },
  { label: "Concluído", status: "Concluído" },
  { label: "Atrasado", status: "Atrasado" },
];

export default function AtividadesPage() {
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [gcs, setGcs] = useState<Gc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<StatusAtividade | "Todas">("Todas");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Atividade | null>(null);
  const [gerandoFollowups, setGerandoFollowups] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function carregar() {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      supabase
        .from("atividades")
        .select("*, empresas(nome_empresa, telefone), oportunidades(projeto)")
        .order("prazo", { ascending: true, nullsFirst: false }),
      supabase.from("empresas").select("*").order("nome_empresa"),
      supabase.from("oportunidades").select("*").order("criado_em", { ascending: false }),
      supabase.from("gcs").select("*").order("nome"),
    ]).then(([{ data: atividadesData }, { data: empresasData }, { data: oportunidadesData }, { data: gcsData }]) => {
      if (cancelado) return;
      setAtividades((atividadesData as unknown as Atividade[]) ?? []);
      setEmpresas(empresasData ?? []);
      setOportunidades(oportunidadesData ?? []);
      setGcs(gcsData ?? []);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, [refreshKey]);

  const gcPorId = useMemo(() => new Map(gcs.map((g) => [g.id, g.nome])), [gcs]);
  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const filtradas = useMemo(() => {
    if (filtro === "Todas") return atividades;
    if (filtro === "Atrasado") {
      return atividades.filter((a) => a.status !== "Concluído" && a.prazo && a.prazo < hoje);
    }
    return atividades.filter((a) => a.status === filtro);
  }, [atividades, filtro, hoje]);

  const pendentesAtrasadas = useMemo(
    () => atividades.filter((a) => a.status !== "Concluído" && a.prazo && a.prazo < hoje).length,
    [atividades, hoje]
  );

  async function mudarStatus(atividade: Atividade, novoStatus: StatusAtividade) {
    setAtividades((prev) => prev.map((a) => (a.id === atividade.id ? { ...a, status: novoStatus } : a)));
    const { error } = await supabase.from("atividades").update({ status: novoStatus }).eq("id", atividade.id);
    if (error) {
      alert("Erro ao atualizar status: " + error.message);
      carregar();
    }
  }

  async function excluir(atividade: Atividade) {
    if (!confirm("Excluir esta atividade?")) return;
    const { error } = await supabase.from("atividades").delete().eq("id", atividade.id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    carregar();
  }

  async function gerarFollowups() {
    setGerandoFollowups(true);
    const { error } = await supabase.rpc("gerar_followups_automaticos");
    setGerandoFollowups(false);
    if (error) {
      alert("Erro ao gerar follow-ups: " + error.message);
      return;
    }
    carregar();
  }

  function abrirNova() {
    setEditando(null);
    setModalAberto(true);
  }

  function abrirEdicao(atividade: Atividade) {
    setEditando(atividade);
    setModalAberto(true);
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Atividades</h1>
          <p className="text-sm text-navy/60">
            {atividades.length} atividades
            {pendentesAtrasadas > 0 && (
              <span className="text-red font-semibold"> · {pendentesAtrasadas} atrasada{pendentesAtrasadas > 1 ? "s" : ""}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={gerarFollowups}
            disabled={gerandoFollowups}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold text-blue border border-blue/30 hover:bg-blue/5 disabled:opacity-50 whitespace-nowrap"
            title="Verifica oportunidades sem interação e cria follow-ups automáticos"
          >
            <RefreshCw size={15} className={gerandoFollowups ? "animate-spin" : ""} />
            Gerar follow-ups
          </button>
          <button onClick={abrirNova} className="btn-primary whitespace-nowrap">
            <Plus size={16} /> Nova atividade
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTROS.map((f) => (
          <button
            key={f.label}
            onClick={() => setFiltro(f.status)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filtro === f.status ? "bg-navy text-cream" : "bg-navy/5 text-navy/60 hover:bg-navy/10"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-navy/15 overflow-hidden shadow-sm">
        {loading ? (
          <p className="p-6 text-sm text-navy/50">Carregando...</p>
        ) : filtradas.length === 0 ? (
          <p className="p-6 text-sm text-navy/50">Nenhuma atividade encontrada.</p>
        ) : (
          <ul>
            {filtradas.map((atividade) => {
              const atrasada = atividade.status !== "Concluído" && !!atividade.prazo && atividade.prazo < hoje;
              return (
                <li
                  key={atividade.id}
                  className="flex items-start gap-3 px-4 py-3 border-b border-navy/5 last:border-0 hover:bg-navy/[0.02]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${atividade.status === "Concluído" ? "text-navy/40 line-through" : "text-navy"}`}>
                        {atividade.tipo_atividade}
                      </span>
                      {atividade.alerta_disparado && (
                        <Badge variant="info" icon={Zap}>
                          automático
                        </Badge>
                      )}
                      {atrasada && (
                        <Badge variant="danger" icon={AlertTriangle}>
                          atrasada
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-navy/50 mt-0.5">
                      {atividade.empresas?.nome_empresa ?? "—"}
                      {atividade.oportunidades?.projeto ? ` · ${atividade.oportunidades.projeto}` : ""}
                      {atividade.responsavel_id ? ` · ${gcPorId.get(atividade.responsavel_id) ?? ""}` : ""}
                      {atividade.prazo ? ` · prazo ${formatarData(atividade.prazo)}` : ""}
                    </div>
                  </div>

                  <select
                    value={atividade.status}
                    onChange={(e) => mudarStatus(atividade, e.target.value as StatusAtividade)}
                    aria-label="Status da atividade"
                    className={`shrink-0 text-xs font-semibold rounded-full px-2.5 py-1 border-0 cursor-pointer ${badgeClasses(STATUS_VARIANTE[atividade.status])}`}
                  >
                    {STATUS_OPCOES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => abrirEdicao(atividade)}
                    className="p-2.5 rounded-md hover:bg-blue/10 text-blue shrink-0"
                    title="Editar"
                    aria-label="Editar atividade"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => excluir(atividade)}
                    className="p-2.5 rounded-md hover:bg-red/10 text-red/70 hover:text-red shrink-0"
                    title="Excluir"
                    aria-label="Excluir atividade"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {modalAberto && (
        <AtividadeModal
          key={editando?.id ?? "novo"}
          atividade={editando}
          empresas={empresas}
          oportunidades={oportunidades}
          gcs={gcs}
          onClose={() => setModalAberto(false)}
          onSaved={() => {
            setModalAberto(false);
            carregar();
          }}
          onDeleted={() => {
            setModalAberto(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

const STATUS_VARIANTE: Record<StatusAtividade, BadgeVariant> = {
  Pendente: "warning",
  "Em andamento": "info",
  Concluído: "success",
  Atrasado: "danger",
};
