"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ETAPAS_FUNIL, type Empresa, type EtapaFunil, type Oportunidade } from "@/lib/types";

interface Props {
  oportunidade: Oportunidade | null;
  empresas: Empresa[];
  etapaInicial?: EtapaFunil;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

// Parent must remount this component (e.g. via `key`) when switching between
// creating a new oportunidade and editing an existing one, so this initial state stays fresh.
export default function OportunidadeModal({
  oportunidade,
  empresas,
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!empresaId) {
      setError("Selecione a empresa.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      empresa_id: empresaId,
      projeto: projeto || null,
      valor_estimado: valor ? Number(valor) : null,
      etapa_atual: etapa,
      ultima_interacao: ultimaInteracao || null,
      proxima_acao: proximaAcao || null,
      data_proxima_acao: dataProximaAcao || null,
      observacoes: observacoes || null,
    };

    const { error } = oportunidade
      ? await supabase.from("oportunidades").update(payload).eq("id", oportunidade.id)
      : await supabase.from("oportunidades").insert(payload);

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
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
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 sticky top-0 bg-white">
          <h2 className="font-semibold text-lg">
            {oportunidade ? "Editar oportunidade" : "Nova oportunidade"}
          </h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-black/5 text-black/60" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-black/60 font-medium">Empresa *</span>
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
            <span className="text-black/60 font-medium">Projeto / Oportunidade</span>
            <input className="input" value={projeto} onChange={(e) => setProjeto(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-black/60 font-medium">Valor estimado (R$)</span>
            <input className="input" type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-black/60 font-medium">Etapa</span>
            <select className="input" value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaFunil)}>
              {ETAPAS_FUNIL.map((et) => (
                <option key={et} value={et}>
                  {et}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-black/60 font-medium">Última interação</span>
            <input className="input" type="date" value={ultimaInteracao} onChange={(e) => setUltimaInteracao(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-black/60 font-medium">Data da próxima ação</span>
            <input className="input" type="date" value={dataProximaAcao} onChange={(e) => setDataProximaAcao(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-black/60 font-medium">Próxima ação</span>
            <input className="input" value={proximaAcao} onChange={(e) => setProximaAcao(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-black/60 font-medium">Observações</span>
            <textarea className="input" rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </label>

          {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}

          <div className="sm:col-span-2 flex justify-between items-center pt-2">
            {oportunidade ? (
              <button type="button" onClick={handleDelete} className="text-sm font-medium text-red-600 hover:underline">
                Excluir
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium text-black/70 hover:bg-black/5">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-md text-sm font-medium bg-black text-white hover:bg-black/80 disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
