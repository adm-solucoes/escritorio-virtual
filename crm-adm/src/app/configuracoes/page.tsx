"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarCheck, ExternalLink, MessageCircle, Save, Trash2, UserPlus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  META_EQUIPE_ID,
  type AcaoRapidaContato,
  type ConfiguracaoRelatorio,
  type EtapaFunilConfig,
  type Gc,
  type Meta,
  type WhatsappNumero,
} from "@/lib/types";
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
  return (
    <Suspense fallback={<p className="p-6 text-sm text-navy/50">Carregando...</p>}>
      <ConfiguracoesConteudo />
    </Suspense>
  );
}

function ConfiguracoesConteudo() {
  const searchParams = useSearchParams();
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

  const [gcAtual, setGcAtual] = useState<Gc | null>(null);
  const [googleConectado, setGoogleConectado] = useState<string | null>(null);
  const [compartilharAgenda, setCompartilharAgenda] = useState(false);
  const [carregandoGoogle, setCarregandoGoogle] = useState(true);
  const [refreshGoogleKey, setRefreshGoogleKey] = useState(0);
  const googleStatus = searchParams.get("google");

  const [numeros, setNumeros] = useState<WhatsappNumero[]>([]);
  const [loadingNumeros, setLoadingNumeros] = useState(true);
  const [refreshNumerosKey, setRefreshNumerosKey] = useState(0);
  const [modalNumeroAberto, setModalNumeroAberto] = useState(false);
  const [etapaModalNumero, setEtapaModalNumero] = useState<"dados" | "codigo">("dados");
  const [ccNovo, setCcNovo] = useState("55");
  const [numeroNovo, setNumeroNovo] = useState("");
  const [nomeNovo, setNomeNovo] = useState("");
  const [phoneNumberIdPendente, setPhoneNumberIdPendente] = useState<string | null>(null);
  const [codigoVerificacao, setCodigoVerificacao] = useState("");
  const [enviandoNumero, setEnviandoNumero] = useState(false);
  const [erroNumero, setErroNumero] = useState<string | null>(null);

  const [contatosAcaoRapida, setContatosAcaoRapida] = useState<AcaoRapidaContato[]>([]);
  const [loadingContatos, setLoadingContatos] = useState(true);
  const [refreshContatosKey, setRefreshContatosKey] = useState(0);
  const [editandoContatoId, setEditandoContatoId] = useState<string | null>(null);
  const [edicaoContato, setEdicaoContato] = useState<{ nome: string; email: string; telefone: string }>({
    nome: "",
    email: "",
    telefone: "",
  });

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("acao_rapida_contatos")
      .select("*")
      .order("quantidade_usos", { ascending: false })
      .then(({ data }) => {
        if (cancelado) return;
        setContatosAcaoRapida((data as AcaoRapidaContato[]) ?? []);
        setLoadingContatos(false);
      });
    return () => {
      cancelado = true;
    };
  }, [refreshContatosKey]);

  function iniciarEdicaoContato(contato: AcaoRapidaContato) {
    setEditandoContatoId(contato.id);
    setEdicaoContato({ nome: contato.nome, email: contato.email, telefone: contato.telefone ?? "" });
  }

  async function salvarEdicaoContato() {
    if (!editandoContatoId) return;
    await supabase
      .from("acao_rapida_contatos")
      .update({ nome: edicaoContato.nome, email: edicaoContato.email, telefone: edicaoContato.telefone || null })
      .eq("id", editandoContatoId);
    setEditandoContatoId(null);
    setRefreshContatosKey((k) => k + 1);
  }

  async function excluirContato(contato: AcaoRapidaContato) {
    if (!confirm(`Remover "${contato.nome}" da memória da Ação Rápida?`)) return;
    await supabase.from("acao_rapida_contatos").delete().eq("id", contato.id);
    setRefreshContatosKey((k) => k + 1);
  }

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

  useEffect(() => {
    let cancelado = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelado || !data.user?.email) {
        setCarregandoGoogle(false);
        return;
      }
      const { data: gc } = await supabase.from("gcs").select("*").eq("email", data.user.email).maybeSingle();
      if (cancelado) return;
      setGcAtual(gc ?? null);
      if (!gc) {
        setCarregandoGoogle(false);
        return;
      }
      const { data: integracao } = await supabase
        .from("integracoes_google")
        .select("email_google, compartilhar_agenda")
        .eq("gc_id", gc.id)
        .maybeSingle();
      if (cancelado) return;
      setGoogleConectado(integracao?.email_google ?? null);
      setCompartilharAgenda(integracao?.compartilhar_agenda ?? false);
      setCarregandoGoogle(false);
    });
    return () => {
      cancelado = true;
    };
  }, [refreshGoogleKey]);

  async function desconectarGoogle() {
    if (!gcAtual) return;
    if (!confirm("Desconectar sua conta Google? As automações de agenda vão parar de funcionar pra você até reconectar.")) return;
    await supabase.from("integracoes_google").delete().eq("gc_id", gcAtual.id);
    setRefreshGoogleKey((k) => k + 1);
  }

  async function alternarCompartilharAgenda(valor: boolean) {
    if (!gcAtual) return;
    setCompartilharAgenda(valor);
    await supabase.from("integracoes_google").update({ compartilhar_agenda: valor }).eq("gc_id", gcAtual.id);
  }

  useEffect(() => {
    let cancelado = false;
    fetch("/api/whatsapp/numeros")
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return;
        setNumeros(d.numeros ?? []);
        setLoadingNumeros(false);
      })
      .catch(() => setLoadingNumeros(false));
    return () => {
      cancelado = true;
    };
  }, [refreshNumerosKey]);

  function fecharModalNumero() {
    setModalNumeroAberto(false);
    setEtapaModalNumero("dados");
    setCcNovo("55");
    setNumeroNovo("");
    setNomeNovo("");
    setPhoneNumberIdPendente(null);
    setCodigoVerificacao("");
    setErroNumero(null);
  }

  async function solicitarNovoNumero() {
    if (!ccNovo.trim() || !numeroNovo.trim() || !nomeNovo.trim()) return;
    setEnviandoNumero(true);
    setErroNumero(null);
    try {
      const res = await fetch("/api/whatsapp/numeros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cc: ccNovo.trim(), numero: numeroNovo.trim(), nomeExibicao: nomeNovo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao adicionar número");
      setPhoneNumberIdPendente(data.phoneNumberId);
      setEtapaModalNumero("codigo");
      setRefreshNumerosKey((k) => k + 1);
    } catch (e) {
      setErroNumero(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setEnviandoNumero(false);
    }
  }

  async function confirmarCodigoNumero() {
    if (!phoneNumberIdPendente || !codigoVerificacao.trim()) return;
    setEnviandoNumero(true);
    setErroNumero(null);
    try {
      const res = await fetch("/api/whatsapp/numeros/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumberId: phoneNumberIdPendente, codigo: codigoVerificacao.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Código inválido");
      fecharModalNumero();
      setRefreshNumerosKey((k) => k + 1);
    } catch (e) {
      setErroNumero(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setEnviandoNumero(false);
    }
  }

  async function ativarNumero(numero: WhatsappNumero) {
    const res = await fetch("/api/whatsapp/numeros/ativar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumberId: numero.phone_number_id }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert("Erro ao ativar: " + (data.error ?? "desconhecido"));
      return;
    }
    setRefreshNumerosKey((k) => k + 1);
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
          <h2 className="text-lg font-extrabold text-navy">Google Calendar</h2>
          <p className="text-sm text-navy/60">
            Conecte sua conta Google (o mesmo e-mail que você usa pra logar aqui) pra automação
            &quot;Agendar reunião&quot; criar eventos direto na sua agenda, com Google Meet.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-navy/10 shadow-sm p-4 flex flex-col gap-3">
          {googleStatus === "erro" && (
            <p className="text-xs text-red">Não deu pra conectar sua conta Google. Tente de novo.</p>
          )}
          {googleStatus === "sem_refresh_token" && (
            <p className="text-xs text-amber-700">
              O Google não devolveu permissão renovável. Vá em{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                myaccount.google.com/permissions
              </a>
              , remova o acesso do CRM ADM Soluções e conecte de novo.
            </p>
          )}
          {carregandoGoogle ? (
            <p className="text-sm text-navy/50">Carregando...</p>
          ) : !gcAtual ? (
            <p className="text-sm text-navy/50">Não encontrei seu usuário de GC pra conectar.</p>
          ) : googleConectado ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-navy/70">
                  <CalendarCheck size={16} className="text-green-600" />
                  Conectado como <strong>{googleConectado}</strong>
                </div>
                <button onClick={desconectarGoogle} className="text-xs font-semibold text-red hover:underline">
                  Desconectar
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm pt-2 border-t border-navy/5">
                <input
                  type="checkbox"
                  checked={compartilharAgenda}
                  onChange={(e) => alternarCompartilharAgenda(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-navy/70">
                  Compartilhar minha agenda com a equipe (aparece em{" "}
                  <Link href="/calendario" className="underline">
                    Agenda da equipe
                  </Link>
                  )
                </span>
              </label>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-navy/60">Nenhuma conta Google conectada ainda.</p>
              <a href={`/api/google/conectar?gcId=${gcAtual.id}`} className="btn-primary whitespace-nowrap">
                <CalendarCheck size={15} /> Conectar Google
              </a>
            </div>
          )}
        </div>
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-navy">Números do WhatsApp</h2>
            <p className="text-sm text-navy/60">
              Números conectados à API do WhatsApp Business. Só um fica ativo por vez — é o que o CRM usa pra
              enviar as mensagens.
            </p>
          </div>
          <button onClick={() => setModalNumeroAberto(true)} className="btn-primary whitespace-nowrap">
            <MessageCircle size={15} /> Adicionar número
          </button>
        </div>

        <div className="bg-white rounded-xl border border-navy/10 shadow-sm overflow-x-auto">
          {loadingNumeros ? (
            <p className="p-6 text-sm text-navy/50">Carregando...</p>
          ) : numeros.length === 0 ? (
            <p className="p-6 text-sm text-navy/50">Nenhum número cadastrado ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-navy/50 border-b border-navy/10 bg-navy/[0.03]">
                  <th className="px-4 py-3 font-semibold">Número</th>
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {numeros.map((n) => (
                  <tr key={n.id} className="border-b border-navy/5 last:border-0">
                    <td className="px-4 py-3 font-semibold text-navy">+{n.numero}</td>
                    <td className="px-4 py-3 text-navy/70">{n.nome_exibicao}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          n.ativo
                            ? "bg-green-100 text-green-700"
                            : n.status === "verificado"
                            ? "bg-blue/10 text-blue"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {n.ativo ? "Ativo" : n.status === "verificado" ? "Verificado" : "Aguardando código"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!n.ativo && n.status === "verificado" && (
                        <button onClick={() => ativarNumero(n)} className="text-xs font-semibold text-blue hover:underline">
                          Tornar ativo
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {modalNumeroAberto && (
          <div className="fixed inset-0 z-50 bg-navy/40 flex items-center justify-center p-4" onClick={fecharModalNumero}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-navy">Adicionar número do WhatsApp</h2>
                <button onClick={fecharModalNumero} className="text-navy/40 hover:text-navy">
                  <X size={18} />
                </button>
              </div>

              {etapaModalNumero === "dados" ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-navy/50">
                    O número não pode estar em uso num WhatsApp comum/Business no celular ao mesmo tempo — ele fica
                    exclusivo da API.
                  </p>
                  <div className="flex gap-2">
                    <label className="flex flex-col gap-1 text-sm w-20">
                      <span className="text-navy/60 font-medium">DDI</span>
                      <input className="input" value={ccNovo} onChange={(e) => setCcNovo(e.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm flex-1">
                      <span className="text-navy/60 font-medium">Número (DDD + número)</span>
                      <input
                        className="input"
                        placeholder="85999998888"
                        value={numeroNovo}
                        onChange={(e) => setNumeroNovo(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-navy/60 font-medium">Nome de exibição</span>
                    <input
                      className="input"
                      placeholder="Ex: ADM Soluções - Comercial"
                      value={nomeNovo}
                      onChange={(e) => setNomeNovo(e.target.value)}
                    />
                  </label>
                  {erroNumero && <p className="text-xs text-red">{erroNumero}</p>}
                  <button onClick={solicitarNovoNumero} disabled={enviandoNumero} className="btn-primary w-fit">
                    {enviandoNumero ? "Enviando..." : "Enviar código por SMS"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-navy/50">
                    Chegou um código por SMS no número {ccNovo}
                    {numeroNovo}. Digite ele abaixo pra confirmar.
                  </p>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-navy/60 font-medium">Código de verificação</span>
                    <input
                      className="input"
                      value={codigoVerificacao}
                      onChange={(e) => setCodigoVerificacao(e.target.value)}
                      autoFocus
                    />
                  </label>
                  {erroNumero && <p className="text-xs text-red">{erroNumero}</p>}
                  <button onClick={confirmarCodigoNumero} disabled={enviandoNumero} className="btn-primary w-fit">
                    {enviandoNumero ? "Confirmando..." : "Confirmar código"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-navy">Contatos da Ação Rápida</h2>
          <p className="text-sm text-navy/60">
            Memória de contatos usados no comando de reunião (Ctrl+K). Corrija um e-mail errado ou remova
            duplicatas.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-navy/10 overflow-x-auto shadow-sm">
          {loadingContatos ? (
            <p className="p-6 text-sm text-navy/50">Carregando...</p>
          ) : contatosAcaoRapida.length === 0 ? (
            <p className="p-6 text-sm text-navy/50">Nenhum contato salvo ainda — use o Ctrl+K pra marcar uma reunião.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-navy/50 border-b border-navy/10 bg-navy/[0.03]">
                  <th className="px-4 py-3 font-semibold">Nome</th>
                  <th className="px-4 py-3 font-semibold">E-mail</th>
                  <th className="px-4 py-3 font-semibold">Telefone</th>
                  <th className="px-4 py-3 font-semibold">Usos</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {contatosAcaoRapida.map((contato) =>
                  editandoContatoId === contato.id ? (
                    <tr key={contato.id} className="border-b border-navy/5 last:border-0">
                      <td className="px-4 py-2">
                        <input
                          className="input"
                          value={edicaoContato.nome}
                          onChange={(e) => setEdicaoContato({ ...edicaoContato, nome: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="input"
                          value={edicaoContato.email}
                          onChange={(e) => setEdicaoContato({ ...edicaoContato, email: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="input"
                          value={edicaoContato.telefone}
                          onChange={(e) => setEdicaoContato({ ...edicaoContato, telefone: e.target.value })}
                        />
                      </td>
                      <td className="px-4 py-2 text-navy/60">{contato.quantidade_usos}</td>
                      <td className="px-4 py-2">
                        <button onClick={salvarEdicaoContato} className="text-xs font-semibold text-blue hover:underline mr-2">
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditandoContatoId(null)}
                          className="text-xs font-semibold text-navy/50 hover:underline"
                        >
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={contato.id} className="border-b border-navy/5 last:border-0 hover:bg-navy/[0.02]">
                      <td className="px-4 py-3 font-semibold text-navy">{contato.nome}</td>
                      <td className="px-4 py-3 text-navy/70">{contato.email}</td>
                      <td className="px-4 py-3 text-navy/70">{contato.telefone ?? "—"}</td>
                      <td className="px-4 py-3 text-navy/60">{contato.quantidade_usos}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => iniciarEdicaoContato(contato)}
                            className="text-xs font-semibold text-blue hover:underline"
                          >
                            Editar
                          </button>
                          <button onClick={() => excluirContato(contato)} className="p-1.5 rounded-md hover:bg-red/10 text-red" title="Excluir">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
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
