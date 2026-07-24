"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { TIPOS_APOIO, type Gc } from "@/lib/types";

interface Props {
  oportunidadeId: string;
  gcs: Gc[];
  onClose: () => void;
  onSaved: () => void;
}

export default function SolicitacaoModal({ oportunidadeId, gcs, onClose, onSaved }: Props) {
  const [nomeEventoProjeto, setNomeEventoProjeto] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [tipoApoio, setTipoApoio] = useState<string[]>([]);
  const [tipoApoioOutro, setTipoApoioOutro] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [dataEvento, setDataEvento] = useState("");
  const [prazo, setPrazo] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [recursosNecessarios, setRecursosNecessarios] = useState("");
  const [emailResponsavel, setEmailResponsavel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function alternarTipo(tipo: string) {
    setTipoApoio((prev) => (prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeEventoProjeto.trim()) {
      setError("Informe o nome do evento ou projeto.");
      return;
    }
    if (!emailResponsavel.trim()) {
      setError("Informe o e-mail de quem vai atender a solicitação.");
      return;
    }
    setSaving(true);
    setError(null);

    const { data, error } = await supabase
      .from("solicitacoes")
      .insert({
        oportunidade_id: oportunidadeId,
        nome_evento_projeto: nomeEventoProjeto.trim(),
        objetivo: objetivo || null,
        tipo_apoio: tipoApoio,
        tipo_apoio_outro: tipoApoioOutro || null,
        justificativa: justificativa || null,
        data_evento: dataEvento || null,
        prazo: prazo || null,
        responsavel_solicitacao_id: responsavelId || null,
        recursos_necessarios: recursosNecessarios || null,
        email_responsavel_atendimento: emailResponsavel.trim(),
      })
      .select("id")
      .single();

    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }

    try {
      await fetch("/api/solicitacoes/notificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solicitacaoId: data.id }),
      });
    } catch {
      // a solicitação já foi salva; a notificação por e-mail é best-effort
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-40 bg-navy/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy/10 sticky top-0 bg-white">
          <h2 className="font-extrabold text-lg text-navy">Nova solicitação</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-navy/5 text-navy/60" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Nome do evento ou projeto *</span>
            <input className="input" value={nomeEventoProjeto} onChange={(e) => setNomeEventoProjeto(e.target.value)} required />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Objetivo da solicitação</span>
            <textarea className="input" rows={2} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
          </label>

          <div className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Tipo de apoio solicitado</span>
            <div className="flex flex-wrap gap-2">
              {TIPOS_APOIO.map((tipo) => (
                <label
                  key={tipo}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer ${
                    tipoApoio.includes(tipo) ? "bg-blue text-white border-blue" : "border-navy/20 text-navy/60"
                  }`}
                >
                  <input type="checkbox" className="hidden" checked={tipoApoio.includes(tipo)} onChange={() => alternarTipo(tipo)} />
                  {tipo}
                </label>
              ))}
            </div>
            <input
              className="input mt-1"
              placeholder="Outro (opcional)"
              value={tipoApoioOutro}
              onChange={(e) => setTipoApoioOutro(e.target.value)}
            />
          </div>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Justificativa</span>
            <textarea className="input" rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Data do evento</span>
            <input className="input" type="date" value={dataEvento} onChange={(e) => setDataEvento(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Prazo</span>
            <input className="input" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-navy/60 font-medium">Responsável pela solicitação</span>
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
            <span className="text-navy/60 font-medium">E-mail de quem vai atender *</span>
            <input
              className="input"
              type="email"
              placeholder="area@admsolucoes.com.br"
              value={emailResponsavel}
              onChange={(e) => setEmailResponsavel(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-navy/60 font-medium">Recursos necessários</span>
            <textarea className="input" rows={2} value={recursosNecessarios} onChange={(e) => setRecursosNecessarios(e.target.value)} />
          </label>

          {error && <p className="sm:col-span-2 text-sm text-red">{error}</p>}

          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm font-semibold text-navy/70 hover:bg-navy/5">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Enviando..." : "Enviar solicitação"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
