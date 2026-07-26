"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { criarTarefaAutomaticaSeConfigurada } from "@/lib/automacoes";
import { ETAPAS_FUNIL, type Empresa, type EtapaFunil, type Gc, type MotivoPerdaConfig, type Oportunidade, type Solicitacao, type TipoPipeline } from "@/lib/types";

const ETAPAS_CS: EtapaFunil[] = ["Onboarding", "Adoção", "Expansão", "Indicação", "Renovação"];
import SolicitacaoModal from "./SolicitacaoModal";

const OUTRO_MOTIVO = "Outro";

interface Props {
  oportunidade: Oportunidade | null;
  empresas: Empresa[];
  gcs: Gc[];
  etapaInicial?: EtapaFunil;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

const STATUS_SOLICITACAO_CORES: Record<string, string> = {
  Pendente: "bg-amber-100 text-amber-700",
  "Em andamento": "bg-blue/10 text-blue",
  Atendida: "bg-green-100 text-green-700",
  Recusada: "bg-red/10 text-red",
};

// Parent must remount this component (e.g. via `key`) when switching between
// creating a new oportunidade and editing an existing one, so this initial state stays fresh.
export default function OportunidadeModal({
  oportunidade,
  empresas,
  gcs,
  etapaInicial,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [empresaId, setEmpresaId] = useState(oportunidade?.empresa_id ?? "");
  const [projeto, setProjeto] = useState(oportunidade?.projeto ?? "");
  const [valor, setValor] = useState(oportunidade?.valor_estimado?.toString() ?? "");
  const [etapa, setEtapa] = useState<EtapaFunil>(oportunidade?.etapa_atual ?? etapaInicial ?? "Prospect");
  const [ultimaInteracao, setUltimaInteracao] = useState(() =>
    oportunidade?.ultima_interacao ?? (oportunidade ? "" : new Date().toISOString().slice(0, 10))
  );
  const [proximaAcao, setProximaAcao] = useState(oportunidade?.proxima_acao ?? "");
  const [dataProximaAcao, setDataProximaAcao] = useState(oportunidade?.data_proxima_acao ?? "");
  const [observacoes, setObservacoes] = useState(oportunidade?.observacoes ?? "");
  const [healthScore, setHealthScore] = useState(oportunidade?.health_score?.toString() ?? "");
  const [motivoSelecionado, setMotivoSelecionado] = useState(() => {
    const atual = oportunidade?.motivo_perda ?? "";
    if (atual.startsWith(`${OUTRO_MOTIVO}: `)) return OUTRO_MOTIVO;
    return atual;
  });
  const [motivoOutroTexto, setMotivoOutroTexto] = useState(() => {
    const atual = oportunidade?.motivo_perda ?? "";
    return atual.startsWith(`${OUTRO_MOTIVO}: `) ? atual.slice(OUTRO_MOTIVO.length + 2) : "";
  });
  const [motivosConfig, setMotivosConfig] = useState<MotivoPerdaConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [modalSolicitacaoAberto, setModalSolicitacaoAberto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("motivos_perda_config")
      .select("*")
      .eq("ativo", true)
      .order("ordem")
      .then(({ data }) => {
        if (!cancelado) setMotivosConfig((data as MotivoPerdaConfig[]) ?? []);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!oportunidade) return;
    let cancelado = false;
    supabase
      .from("solicitacoes")
      .select("*")
      .eq("oportunidade_id", oportunidade.id)
      .order("data_solicitacao", { ascending: false })
      .then(({ data }) => {
        if (cancelado) return;
        setSolicitacoes((data as Solicitacao[]) ?? []);
      });
    return () => {
      cancelado = true;
    };
  }, [oportunidade]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!empresaId) {
      setError("Selecione a empresa.");
      return;
    }
    if (etapa === "Perdido" && !motivoSelecionado) {
      setError("Selecione o motivo da perda.");
      return;
    }
    if (etapa === "Perdido" && motivoSelecionado === OUTRO_MOTIVO && !motivoOutroTexto.trim()) {
      setError("Descreva o motivo da perda.");
      return;
    }
    setSaving(true);
    setError(null);

    const motivoPerdaFinal =
      motivoSelecionado === OUTRO_MOTIVO ? `${OUTRO_MOTIVO}: ${motivoOutroTexto.trim()}` : motivoSelecionado;

    const payload = {
      empresa_id: empresaId,
      projeto: projeto || null,
      valor_estimado: valor ? Number(valor) : null,
      etapa_atual: etapa,
      ultima_interacao: ultimaInteracao || null,
      proxima_acao: proximaAcao || null,
      data_proxima_acao: dataProximaAcao || null,
      observacoes: observacoes || null,
      motivo_perda: etapa === "Perdido" ? motivoPerdaFinal : null,
      health_score: ["Onboarding", "Adoção", "Renovação"].includes(etapa) && healthScore ? Number(healthScore) : null,
      ...(oportunidade ? {} : { tipo_pipeline: (ETAPAS_CS.includes(etapa) ? "cs" : "comercial") as TipoPipeline }),
    };

    const etapaAnterior = oportunidade?.etapa_atual;

    const { data, error } = oportunidade
      ? await supabase.from("oportunidades").update(payload).eq("id", oportunidade.id).select("id, gc_responsavel_id").single()
      : await supabase.from("oportunidades").insert(payload).select("id, gc_responsavel_id").single();

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }

    if (data && etapa !== "Perdido" && etapa !== etapaAnterior) {
      await criarTarefaAutomaticaSeConfigurada({ id: data.id, empresa_id: empresaId, gc_responsavel_id: data.gc_responsavel_id }, etapa);
    }

    onSaved();
  }

  async function handleDelete() {
    if (!oportunidade) return;
    if (!confirm("Excluir esta oportunidade?")) return;
    const { error } = await supabase.from("oportunidades").delete().eq("id", oportunidade.id);
    if (error) {
      setError(error.message);
      return;
    }
    onDeleted();
  }

  return (
    <div className="fixed inset-0 z-30 bg-navy/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy/10 sticky top-0 bg-white">
          <h2 className="font-extrabold text-lg text-navy">
            {oportunidade ? "Editar oportunidade" : "Nova oportunidade"}
          </h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-navy/5 text-navy/60" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Empresa *</span>
            <select className="input" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} required>
              <option value="">Selecione...</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome_empresa}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Projeto / Oportunidade</span>
            <input className="input" value={projeto} onChange={(e) => setProjeto(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Valor estimado (R$)</span>
            <input className="input" type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Etapa</span>
            <select className="input" value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaFunil)}>
              {ETAPAS_FUNIL.map((et) => (
                <option key={et} value={et}>
                  {et}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Última interação</span>
            <input className="input" type="date" value={ultimaInteracao} onChange={(e) => setUltimaInteracao(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Data da próxima ação</span>
            <input className="input" type="date" value={dataProximaAcao} onChange={(e) => setDataProximaAcao(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Próxima ação</span>
            <input className="input" value={proximaAcao} onChange={(e) => setProximaAcao(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Observações</span>
            <textarea className="input" rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </label>

          {["Onboarding", "Adoção", "Renovação"].includes(etapa) && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-navy/60 font-medium">Health Score (0-100)</span>
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={healthScore}
                onChange={(e) => setHealthScore(e.target.value)}
              />
            </label>
          )}

          {etapa === "Perdido" && (
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-red font-medium">Motivo da perda *</span>
              <select
                className="input"
                value={motivoSelecionado}
                onChange={(e) => setMotivoSelecionado(e.target.value)}
                required
              >
                <option value="">Selecione...</option>
                {motivosConfig.map((m) => (
                  <option key={m.id} value={m.motivo}>
                    {m.motivo}
                  </option>
                ))}
                <option value={OUTRO_MOTIVO}>{OUTRO_MOTIVO}</option>
              </select>
              {motivoSelecionado === OUTRO_MOTIVO && (
                <input
                  className="input mt-1"
                  placeholder="Descreva o motivo..."
                  value={motivoOutroTexto}
                  onChange={(e) => setMotivoOutroTexto(e.target.value)}
                />
              )}
            </label>
          )}

          {error && <p className="sm:col-span-2 text-sm text-red">{error}</p>}

          <div className="sm:col-span-2 flex justify-between items-center pt-2">
            {oportunidade ? (
              <button type="button" onClick={handleDelete} className="text-sm font-semibold text-red hover:underline">
                Excluir
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm font-semibold text-navy/70 hover:bg-navy/5">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </form>

        {oportunidade && (
          <div className="px-6 pb-6">
            <div className="flex items-center justify-between border-t border-navy/10 pt-4">
              <h3 className="text-sm font-bold text-navy flex items-center gap-1.5">
                <ClipboardList size={15} /> Solicitações
              </h3>
              <button
                type="button"
                onClick={() => setModalSolicitacaoAberto(true)}
                className="flex items-center gap-1 text-xs font-semibold text-blue hover:underline"
              >
                <Plus size={13} /> Nova solicitação
              </button>
            </div>

            {solicitacoes.length === 0 ? (
              <p className="text-xs text-navy/40 mt-2">Nenhuma solicitação registrada para esta oportunidade.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {solicitacoes.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 bg-navy/[0.03] rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-navy truncate">{s.nome_evento_projeto}</div>
                      <div className="text-xs text-navy/50">
                        {[...s.tipo_apoio, s.tipo_apoio_outro].filter(Boolean).join(", ") || "—"}
                      </div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_SOLICITACAO_CORES[s.status] ?? ""}`}>
                      {s.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {modalSolicitacaoAberto && oportunidade && (
        <SolicitacaoModal
          oportunidadeId={oportunidade.id}
          gcs={gcs}
          onClose={() => setModalSolicitacaoAberto(false)}
          onSaved={() => {
            setModalSolicitacaoAberto(false);
            supabase
              .from("solicitacoes")
              .select("*")
              .eq("oportunidade_id", oportunidade.id)
              .order("data_solicitacao", { ascending: false })
              .then(({ data }) => setSolicitacoes((data as Solicitacao[]) ?? []));
          }}
        />
      )}
    </div>
  );
}
