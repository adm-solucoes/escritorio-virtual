"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { EtapaFunilConfig } from "@/lib/types";

export default function ConfiguracoesPage() {
  const [etapas, setEtapas] = useState<EtapaFunilConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("etapas_funil")
      .select("*")
      .order("ordem")
      .then(({ data }) => {
        if (cancelado) return;
        setEtapas((data as EtapaFunilConfig[]) ?? []);
        setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [refreshKey]);

  function atualizarCampo(id: number, campo: "probabilidade" | "dias_alerta_followup", valor: number) {
    setEtapas((prev) => prev.map((e) => (e.id === id ? { ...e, [campo]: valor } : e)));
  }

  async function salvar(etapa: EtapaFunilConfig) {
    setSalvandoId(etapa.id);
    const { error } = await supabase
      .from("etapas_funil")
      .update({
        probabilidade: etapa.probabilidade,
        dias_alerta_followup: etapa.dias_alerta_followup,
      })
      .eq("id", etapa.id);
    if (error) {
      setSalvandoId(null);
      alert("Erro ao salvar: " + error.message);
      return;
    }
    const { error: erroAplicar } = await supabase
      .from("oportunidades")
      .update({ probabilidade: etapa.probabilidade })
      .eq("etapa_atual", etapa.nome);
    setSalvandoId(null);
    if (erroAplicar) {
      alert("Configuração salva, mas houve erro ao atualizar oportunidades existentes: " + erroAplicar.message);
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold text-navy">Configurações do funil</h1>
        <p className="text-sm text-navy/60">
          Ajuste a probabilidade de fechamento e o prazo de alerta de follow-up de cada etapa. Isso afeta o cálculo
          de receita ponderada no pipeline e a geração automática de atividades.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-navy/10 overflow-x-auto shadow-sm">
        {loading ? (
          <p className="p-6 text-sm text-navy/50">Carregando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-navy/50 border-b border-navy/10 bg-navy/[0.03]">
                <th className="px-4 py-3 font-semibold">Etapa</th>
                <th className="px-4 py-3 font-semibold">Probabilidade (%)</th>
                <th className="px-4 py-3 font-semibold">Alerta de follow-up (dias sem interação)</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {etapas.map((etapa) => (
                <tr key={etapa.id} className="border-b border-navy/5 last:border-0">
                  <td className="px-4 py-3 font-semibold text-navy">{etapa.nome}</td>
                  <td className="px-4 py-3">
                    <input
                      className="input w-24"
                      type="number"
                      min={0}
                      max={999}
                      step={1}
                      value={Math.round(etapa.probabilidade * 100)}
                      onChange={(e) =>
                        atualizarCampo(etapa.id, "probabilidade", Number(e.target.value) / 100)
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="input w-24"
                      type="number"
                      min={0}
                      max={365}
                      step={1}
                      value={etapa.dias_alerta_followup}
                      onChange={(e) => atualizarCampo(etapa.id, "dias_alerta_followup", Number(e.target.value))}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => salvar(etapa)}
                      disabled={salvandoId === etapa.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-blue border border-blue/30 hover:bg-blue/5 disabled:opacity-50"
                    >
                      <Save size={13} />
                      {salvandoId === etapa.id ? "Salvando..." : "Salvar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-navy/40">
        Ao salvar, todas as oportunidades que já estão nessa etapa são atualizadas com a nova porcentagem
        imediatamente (a receita ponderada é recalculada sozinha).
      </p>
    </div>
  );
}
