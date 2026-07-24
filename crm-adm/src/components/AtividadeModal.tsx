"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Empresa, Gc, Oportunidade, StatusAtividade } from "@/lib/types";

interface Props {
  empresas: Empresa[];
  oportunidades: Oportunidade[];
  gcs: Gc[];
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPCOES: StatusAtividade[] = ["Pendente", "Em andamento", "Concluído", "Atrasado"];

export default function AtividadeModal({ empresas, oportunidades, gcs, onClose, onSaved }: Props) {
  const [empresaId, setEmpresaId] = useState("");
  const [oportunidadeId, setOportunidadeId] = useState("");
  const [tipoAtividade, setTipoAtividade] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [status, setStatus] = useState<StatusAtividade>("Pendente");
  const [prazo, setPrazo] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oportunidadesDaEmpresa = useMemo(
    () => oportunidades.filter((o) => o.empresa_id === empresaId),
    [oportunidades, empresaId]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!empresaId) {
      setError("Selecione a empresa.");
      return;
    }
    if (!tipoAtividade.trim()) {
      setError("Descreva a atividade.");
      return;
    }
    setSaving(true);
    setError(null);

    const { error } = await supabase.from("atividades").insert({
      empresa_id: empresaId,
      oportunidade_id: oportunidadeId || null,
      tipo_atividade: tipoAtividade.trim(),
      responsavel_id: responsavelId || null,
      status,
      prazo: prazo || null,
    });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-30 bg-navy/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy/10 sticky top-0 bg-white">
          <h2 className="font-extrabold text-lg text-navy">Nova atividade</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-navy/5 text-navy/60" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Empresa *</span>
            <select
              className="input"
              value={empresaId}
              onChange={(e) => {
                setEmpresaId(e.target.value);
                setOportunidadeId("");
              }}
              required
            >
              <option value="">Selecione...</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome_empresa}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Oportunidade (opcional)</span>
            <select
              className="input"
              value={oportunidadeId}
              onChange={(e) => setOportunidadeId(e.target.value)}
              disabled={!empresaId}
            >
              <option value="">—</option>
              {oportunidadesDaEmpresa.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.projeto || o.etapa_atual}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Atividade *</span>
            <input
              className="input"
              placeholder="Ex: Ligar para confirmar reunião"
              value={tipoAtividade}
              onChange={(e) => setTipoAtividade(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Responsável</span>
            <select className="input" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
              <option value="">—</option>
              {gcs.map((gc) => (
                <option key={gc.id} value={gc.id}>
                  {gc.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Prazo</span>
            <input className="input" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Status</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as StatusAtividade)}>
              {STATUS_OPCOES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="sm:col-span-2 text-sm text-red">{error}</p>}

          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm font-semibold text-navy/70 hover:bg-navy/5">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
