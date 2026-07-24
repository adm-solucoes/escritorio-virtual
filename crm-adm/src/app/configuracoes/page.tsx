"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ConfiguracaoRelatorio, EtapaFunilConfig } from "@/lib/types";

const RELATORIO_PADRAO: ConfiguracaoRelatorio = {
  id: 1,
  email_destino: "",
  envio_automatico: true,
  incluir_vendas: true,
  incluir_perdas: true,
  incluir_origem: true,
  incluir_responsavel: true,
  incluir_evolucao: true,
};

const SECOES_RELATORIO: { campo: keyof ConfiguracaoRelatorio; label: string }[] = [
  { campo: "incluir_vendas", label: "Relatório mensal de vendas" },
  { campo: "incluir_perdas", label: "Relatório de perdas por motivo" },
  { campo: "incluir_origem", label: "Relatório por origem de lead" },
  { campo: "incluir_responsavel", label: "Relatório por responsável" },
  { campo: "incluir_evolucao", label: "Evolução de leads e oportunidades" },
];

export default function ConfiguracoesPage() {
  const [etapas, setEtapas] = useState<EtapaFunilConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [relatorio, setRelatorio] = useState<ConfiguracaoRelatorio | null>(null);
  const [loadingRelatorio, setLoadingRelatorio] = useState(true);
  const [salvandoRelatorio, setSalvandoRelatorio] = useState(false);
  const [mensagemRelatorio, setMensagemRelatorio] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("configuracoes_relatorio")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return;
        setRelatorio(data ? { ...RELATORIO_PADRAO, ...(data as ConfiguracaoRelatorio) } : RELATORIO_PADRAO);
        setLoadingRelatorio(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

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

  async function salvarRelatorio() {
    if (!relatorio) return;
    setSalvandoRelatorio(true);
    setMensagemRelatorio(null);
    const { error } = await supabase.from("configuracoes_relatorio").upsert(relatorio);
    setSalvandoRelatorio(false);
    if (error) {
      setMensagemRelatorio("Erro ao salvar: " + error.message);
      return;
    }
    setMensagemRelatorio("Salvo!");
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-8">
      <div className="flex flex-col gap-4">
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

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-navy">Relatórios por e-mail</h2>
            <p className="text-sm text-navy/60">
              Defina para quem os relatórios são enviados, se o envio mensal automático (todo dia 1) fica ativo e
              quais seções entram no e-mail.
            </p>
          </div>
          <Link
            href="/relatorios"
            className="flex items-center gap-1.5 text-sm font-semibold text-blue hover:underline whitespace-nowrap"
          >
            Ver relatórios completos <ExternalLink size={14} />
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-navy/10 shadow-sm p-4 flex flex-col gap-4">
          {loadingRelatorio || !relatorio ? (
            <p className="text-sm text-navy/50">Carregando...</p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm max-w-md">
                <span className="text-navy/60 font-medium">E-mail(s) de destino</span>
                <input
                  className="input"
                  placeholder="seuemail@admsolucoes.com.br"
                  value={relatorio.email_destino ?? ""}
                  onChange={(e) => setRelatorio({ ...relatorio, email_destino: e.target.value })}
                />
                <span className="text-xs text-navy/40">Separe múltiplos e-mails por vírgula.</span>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={relatorio.envio_automatico}
                  onChange={(e) => setRelatorio({ ...relatorio, envio_automatico: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-navy/70 font-medium">Enviar automaticamente todo dia 1 do mês</span>
              </label>

              <div className="flex flex-col gap-2 pt-2 border-t border-navy/5">
                <span className="text-navy/60 font-medium text-sm">O que entra no e-mail</span>
                {SECOES_RELATORIO.map(({ campo, label }) => (
                  <label key={campo} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(relatorio[campo])}
                      onChange={(e) => setRelatorio({ ...relatorio, [campo]: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-navy/70">{label}</span>
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={salvarRelatorio}
                  disabled={salvandoRelatorio}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold text-blue border border-blue/30 hover:bg-blue/5 disabled:opacity-50 w-fit"
                >
                  <Save size={14} />
                  {salvandoRelatorio ? "Salvando..." : "Salvar"}
                </button>
                {mensagemRelatorio && <span className="text-xs text-navy/60">{mensagemRelatorio}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
