"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Save, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { META_EQUIPE_ID, type ConfiguracaoRelatorio, type EtapaFunilConfig, type Gc, type Meta } from "@/lib/types";
import TrocarSenha from "@/components/TrocarSenha";

const MESES_LABEL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const RELATORIO_PADRAO: ConfiguracaoRelatorio = {
  id: 1,
  email_destino: "",
  envio_automatico: true,
  incluir_vendas: true,
  incluir_perdas: true,
  incluir_origem: true,
  incluir_responsavel: true,
  incluir_evolucao: true,
  notificar_atividades_atrasadas: true,
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

  const hoje = useMemo(() => new Date(), []);
  const [gcs, setGcs] = useState<Gc[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState(hoje.getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState(hoje.getFullYear());
  const [valoresMeta, setValoresMeta] = useState<Record<string, string>>({});
  const [loadingMetas, setLoadingMetas] = useState(true);
  const [salvandoMeta, setSalvandoMeta] = useState<string | null>(null);
  const [refreshMetasKey, setRefreshMetasKey] = useState(0);

  const [refreshGcsKey, setRefreshGcsKey] = useState(0);
  const [nomeConvite, setNomeConvite] = useState("");
  const [emailConvite, setEmailConvite] = useState("");
  const [convidando, setConvidando] = useState(false);
  const [mensagemConvite, setMensagemConvite] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("gcs")
      .select("*")
      .order("nome")
      .then(({ data }) => {
        if (cancelado) return;
        setGcs((data as Gc[]) ?? []);
      });
    return () => {
      cancelado = true;
    };
  }, [refreshGcsKey]);

  async function convidarMembro(e: React.FormEvent) {
    e.preventDefault();
    if (!nomeConvite.trim() || !emailConvite.trim()) return;
    setConvidando(true);
    setMensagemConvite(null);
    try {
      const res = await fetch("/api/membros/convidar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeConvite.trim(), email: emailConvite.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao convidar");
      setMensagemConvite(data.jaExistia ? "Esse e-mail já tinha uma conta; dados atualizados." : "Convite enviado por e-mail!");
      setNomeConvite("");
      setEmailConvite("");
      setRefreshGcsKey((k) => k + 1);
    } catch (e) {
      setMensagemConvite("Erro: " + (e instanceof Error ? e.message : "desconhecido"));
    } finally {
      setConvidando(false);
    }
  }

  async function alternarStatus(gc: Gc) {
    const novoStatus = gc.status === "Ativo" ? "Inativo" : "Ativo";
    const { error } = await supabase.from("gcs").update({ status: novoStatus }).eq("id", gc.id);
    if (error) {
      alert("Erro ao atualizar: " + error.message);
      return;
    }
    setRefreshGcsKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("metas")
      .select("*")
      .eq("mes", mesSelecionado)
      .eq("ano", anoSelecionado)
      .then(({ data }) => {
        if (cancelado) return;
        const metas = (data as Meta[]) ?? [];
        const mapa: Record<string, string> = {};
        for (const m of metas) {
          mapa[m.gc_id] = m.valor_meta.toString();
        }
        setValoresMeta(mapa);
        setLoadingMetas(false);
      });
    return () => {
      cancelado = true;
    };
  }, [mesSelecionado, anoSelecionado, refreshMetasKey]);

  async function salvarMeta(gcId: string) {
    setSalvandoMeta(gcId);
    const valor = Number(valoresMeta[gcId] || 0);
    const { error } = await supabase
      .from("metas")
      .upsert(
        { gc_id: gcId, mes: mesSelecionado, ano: anoSelecionado, valor_meta: valor },
        { onConflict: "gc_id,mes,ano" }
      );
    setSalvandoMeta(null);
    if (error) {
      alert("Erro ao salvar meta: " + error.message);
      return;
    }
    setRefreshMetasKey((k) => k + 1);
  }

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

  function atualizarCampo(
    id: number,
    campo: "probabilidade" | "dias_alerta_followup" | "tarefa_padrao",
    valor: number | string
  ) {
    setEtapas((prev) => prev.map((e) => (e.id === id ? { ...e, [campo]: valor } : e)));
  }

  async function salvar(etapa: EtapaFunilConfig) {
    setSalvandoId(etapa.id);
    const { error } = await supabase
      .from("etapas_funil")
      .update({
        probabilidade: etapa.probabilidade,
        dias_alerta_followup: etapa.dias_alerta_followup,
        tarefa_padrao: etapa.tarefa_padrao || null,
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
          <h1 className="text-xl font-extrabold text-navy">Minha conta</h1>
          <p className="text-sm text-navy/60">Troque sua senha de acesso ao sistema.</p>
        </div>
        <TrocarSenha />
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-navy">Membros</h2>
          <p className="text-sm text-navy/60">
            Convide novos gerentes de conta (GCs) — eles recebem um e-mail para criar a própria senha e passam a
            aparecer como opção de responsável em toda a plataforma.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-navy/10 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-navy/50 border-b border-navy/10 bg-navy/[0.03]">
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">E-mail</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {gcs.map((gc) => (
                <tr key={gc.id} className="border-b border-navy/5 last:border-0">
                  <td className="px-4 py-3 font-semibold text-navy">{gc.nome}</td>
                  <td className="px-4 py-3 text-navy/70">{gc.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        gc.status === "Ativo" ? "bg-green-100 text-green-700" : "bg-navy/5 text-navy/50"
                      }`}
                    >
                      {gc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => alternarStatus(gc)}
                      className="text-xs font-semibold text-blue hover:underline"
                    >
                      {gc.status === "Ativo" ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form onSubmit={convidarMembro} className="p-4 border-t border-navy/10 flex flex-col sm:flex-row gap-2 items-start sm:items-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-navy/60 font-medium">Nome</span>
              <input className="input w-48" value={nomeConvite} onChange={(e) => setNomeConvite(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-navy/60 font-medium">E-mail</span>
              <input className="input w-56" type="email" value={emailConvite} onChange={(e) => setEmailConvite(e.target.value)} />
            </label>
            <button type="submit" disabled={convidando} className="btn-primary">
              <UserPlus size={15} /> {convidando ? "Convidando..." : "Convidar membro"}
            </button>
            {mensagemConvite && <span className="text-xs text-navy/60 sm:ml-2">{mensagemConvite}</span>}
          </form>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-navy">Configurações do funil</h2>
          <p className="text-sm text-navy/60">
            Ajuste a probabilidade de fechamento, o prazo de alerta de follow-up e a tarefa criada automaticamente
            quando uma oportunidade entra em cada etapa (deixe em branco pra não criar nenhuma).
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
                  <th className="px-4 py-3 font-semibold">Tarefa automática ao entrar na etapa</th>
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
                      <input
                        className="input w-56"
                        placeholder="Nenhuma"
                        value={etapa.tarefa_padrao ?? ""}
                        onChange={(e) => atualizarCampo(etapa.id, "tarefa_padrao", e.target.value)}
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
            <h2 className="text-lg font-extrabold text-navy">Metas</h2>
            <p className="text-sm text-navy/60">
              Meta de receita fechada da equipe e de cada GC, por mês. O Dashboard compara com o que já foi
              realizado.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              className="input"
              value={mesSelecionado}
              onChange={(e) => setMesSelecionado(Number(e.target.value))}
            >
              {MESES_LABEL.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
            <input
              className="input w-24"
              type="number"
              value={anoSelecionado}
              onChange={(e) => setAnoSelecionado(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-navy/10 shadow-sm overflow-x-auto">
          {loadingMetas ? (
            <p className="p-6 text-sm text-navy/50">Carregando...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-navy/50 border-b border-navy/10 bg-navy/[0.03]">
                  <th className="px-4 py-3 font-semibold">Quem</th>
                  <th className="px-4 py-3 font-semibold">Meta de receita (R$)</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-navy/5">
                  <td className="px-4 py-3 font-semibold text-navy">Equipe (total)</td>
                  <td className="px-4 py-3">
                    <input
                      className="input w-32"
                      type="number"
                      min={0}
                      value={valoresMeta[META_EQUIPE_ID] ?? ""}
                      onChange={(e) => setValoresMeta({ ...valoresMeta, [META_EQUIPE_ID]: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => salvarMeta(META_EQUIPE_ID)}
                      disabled={salvandoMeta === META_EQUIPE_ID}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-blue border border-blue/30 hover:bg-blue/5 disabled:opacity-50"
                    >
                      <Save size={13} />
                      {salvandoMeta === META_EQUIPE_ID ? "Salvando..." : "Salvar"}
                    </button>
                  </td>
                </tr>
                {gcs.map((gc) => (
                  <tr key={gc.id} className="border-b border-navy/5 last:border-0">
                    <td className="px-4 py-3 text-navy">{gc.nome}</td>
                    <td className="px-4 py-3">
                      <input
                        className="input w-32"
                        type="number"
                        min={0}
                        value={valoresMeta[gc.id] ?? ""}
                        onChange={(e) => setValoresMeta({ ...valoresMeta, [gc.id]: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => salvarMeta(gc.id)}
                        disabled={salvandoMeta === gc.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-blue border border-blue/30 hover:bg-blue/5 disabled:opacity-50"
                      >
                        <Save size={13} />
                        {salvandoMeta === gc.id ? "Salvando..." : "Salvar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
                <span className="text-navy/70 font-medium">Enviar relatório automaticamente todo dia 1 do mês</span>
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={relatorio.notificar_atividades_atrasadas}
                  onChange={(e) => setRelatorio({ ...relatorio, notificar_atividades_atrasadas: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-navy/70 font-medium">Avisar por e-mail toda segunda-feira sobre atividades atrasadas</span>
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
