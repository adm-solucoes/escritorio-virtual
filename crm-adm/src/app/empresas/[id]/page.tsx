"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessagesSquare, Pencil, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  Atividade,
  Empresa,
  Gc,
  NpsResposta,
  Oportunidade,
  OportunidadeHistoricoEtapa,
  WhatsappConversa,
  WhatsappMensagem,
} from "@/lib/types";
import { obterOuCriarConversaWhatsapp } from "@/lib/whatsapp";
import { calcularScoreLead, classificarScore } from "@/lib/score";
import EmpresaModal from "@/components/EmpresaModal";
import OportunidadeModal from "@/components/OportunidadeModal";

export default function EmpresaPerfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [historico, setHistorico] = useState<OportunidadeHistoricoEtapa[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [conversa, setConversa] = useState<WhatsappConversa | null>(null);
  const [mensagens, setMensagens] = useState<WhatsappMensagem[]>([]);
  const [nps, setNps] = useState<NpsResposta[]>([]);
  const [gcs, setGcs] = useState<Gc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [modalEmpresaAberto, setModalEmpresaAberto] = useState(false);
  const [oportunidadeEditando, setOportunidadeEditando] = useState<Oportunidade | null>(null);
  const [modalOportunidadeAberto, setModalOportunidadeAberto] = useState(false);
  const [modalNpsAberto, setModalNpsAberto] = useState(false);
  const [notaNps, setNotaNps] = useState("8");
  const [comentarioNps, setComentarioNps] = useState("");

  function carregar() {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      supabase.from("empresas").select("*").eq("id", id).maybeSingle(),
      supabase.from("oportunidades").select("*").eq("empresa_id", id).order("criado_em", { ascending: false }),
      supabase.from("atividades").select("*").eq("empresa_id", id).order("prazo", { ascending: true, nullsFirst: false }),
      supabase.from("whatsapp_conversas").select("*").eq("empresa_id", id).maybeSingle(),
      supabase.from("nps_respostas").select("*").eq("empresa_id", id).order("data", { ascending: false }),
      supabase.from("gcs").select("*").order("nome"),
    ]).then(([empresaRes, opsRes, atividadesRes, conversaRes, npsRes, gcsRes]) => {
      if (cancelado) return;
      setEmpresa((empresaRes.data as Empresa) ?? null);
      setOportunidades((opsRes.data as Oportunidade[]) ?? []);
      setAtividades((atividadesRes.data as Atividade[]) ?? []);
      setConversa((conversaRes.data as WhatsappConversa) ?? null);
      setNps((npsRes.data as NpsResposta[]) ?? []);
      setGcs((gcsRes.data as Gc[]) ?? []);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, [id, refreshKey]);

  useEffect(() => {
    let cancelado = false;
    const consulta = conversa
      ? supabase
          .from("whatsapp_mensagens")
          .select("*")
          .eq("conversa_id", conversa.id)
          .order("criado_em", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as WhatsappMensagem[] });
    consulta.then(({ data }) => {
      if (!cancelado) setMensagens(((data as WhatsappMensagem[]) ?? []).reverse());
    });
    return () => {
      cancelado = true;
    };
  }, [conversa]);

  useEffect(() => {
    let cancelado = false;
    const consulta =
      oportunidades.length === 0
        ? Promise.resolve({ data: [] as OportunidadeHistoricoEtapa[] })
        : supabase
            .from("oportunidade_historico_etapa")
            .select("*")
            .in("oportunidade_id", oportunidades.map((o) => o.id))
            .order("data_mudanca", { ascending: false });
    consulta.then(({ data }) => {
      if (!cancelado) setHistorico((data as OportunidadeHistoricoEtapa[]) ?? []);
    });
    return () => {
      cancelado = true;
    };
  }, [oportunidades]);

  const gcPorId = useMemo(() => new Map(gcs.map((g) => [g.id, g.nome])), [gcs]);
  const oportunidadesPorId = useMemo(() => new Map(oportunidades.map((o) => [o.id, o])), [oportunidades]);

  const score = useMemo(() => (empresa ? calcularScoreLead(empresa, oportunidades).pontos : 0), [empresa, oportunidades]);
  const classificacao = classificarScore(score);

  async function abrirConversaWhatsapp() {
    if (!empresa) return;
    const resultado = await obterOuCriarConversaWhatsapp(empresa.id, empresa.telefone);
    if ("erro" in resultado) {
      alert(resultado.erro);
      return;
    }
    router.push(`/whatsapp?conversa=${resultado.id}`);
  }

  async function salvarNps(e: React.FormEvent) {
    e.preventDefault();
    if (!empresa) return;
    const { error } = await supabase.from("nps_respostas").insert({
      empresa_id: empresa.id,
      nota: Number(notaNps),
      comentario: comentarioNps || null,
    });
    if (error) {
      alert("Erro ao salvar NPS: " + error.message);
      return;
    }
    setModalNpsAberto(false);
    setComentarioNps("");
    carregar();
  }

  if (loading) {
    return <p className="p-6 text-sm text-navy/50">Carregando...</p>;
  }

  if (!empresa) {
    return (
      <div className="max-w-2xl mx-auto w-full px-6 py-16 text-center">
        <p className="text-sm text-navy/60">Empresa não encontrada.</p>
        <Link href="/empresas" className="text-sm font-semibold text-blue hover:underline">
          Voltar para Empresas
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-6">
      <Link href="/empresas" className="flex items-center gap-1.5 text-sm text-navy/60 hover:text-navy w-fit">
        <ArrowLeft size={15} /> Empresas
      </Link>

      <div className="bg-white rounded-xl border border-navy/10 shadow-sm p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-extrabold text-navy">{empresa.nome_empresa}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${classificacao.cor}`}>
              {score} · {classificacao.label}
            </span>
          </div>
          <p className="text-sm text-navy/60 mt-1">
            {empresa.segmento ?? "—"} · {empresa.cidade}
            {empresa.estado ? `/${empresa.estado}` : ""}
          </p>
          <div className="text-sm text-navy/70 mt-2 flex flex-col gap-0.5">
            <span>
              Contato: {empresa.nome_contato ?? "—"} {empresa.cargo ? `(${empresa.cargo})` : ""}
            </span>
            <span>Telefone: {empresa.telefone ?? "—"} · E-mail: {empresa.email ?? "—"}</span>
            <span>GC responsável: {empresa.gc_responsavel_id ? gcPorId.get(empresa.gc_responsavel_id) : "—"}</span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {empresa.telefone && (
            <button onClick={abrirConversaWhatsapp} className="btn-primary whitespace-nowrap bg-green-600 hover:bg-green-700">
              <MessagesSquare size={15} /> WhatsApp
            </button>
          )}
          <button onClick={() => setModalEmpresaAberto(true)} className="px-3 py-2 rounded-md text-sm font-semibold text-blue hover:bg-blue/10 flex items-center gap-1.5">
            <Pencil size={15} /> Editar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy">Oportunidades ({oportunidades.length})</h2>
            <button
              onClick={() => {
                setOportunidadeEditando(null);
                setModalOportunidadeAberto(true);
              }}
              className="flex items-center gap-1 text-xs font-semibold text-blue hover:underline"
            >
              <Plus size={13} /> Nova
            </button>
          </div>
          {oportunidades.length === 0 ? (
            <p className="text-xs text-navy/40">Nenhuma oportunidade ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {oportunidades.map((o) => (
                <li
                  key={o.id}
                  onClick={() => {
                    setOportunidadeEditando(o);
                    setModalOportunidadeAberto(true);
                  }}
                  className="bg-white rounded-lg border border-navy/10 p-3 cursor-pointer hover:border-blue/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-navy truncate">{o.projeto || o.etapa_atual}</span>
                    <span
                      className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        o.tipo_pipeline === "cs" ? "bg-blue/10 text-blue" : "bg-navy/5 text-navy/60"
                      }`}
                    >
                      {o.tipo_pipeline === "cs" ? "CS" : "Comercial"}
                    </span>
                  </div>
                  <div className="text-xs text-navy/50 mt-1">
                    {o.etapa_atual} · {o.valor_estimado?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "—"}
                    {o.health_score !== null ? ` · Health ${o.health_score}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-navy">Histórico de etapa</h2>
          {historico.length === 0 ? (
            <p className="text-xs text-navy/40">Sem histórico registrado ainda.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {historico.map((h) => (
                <li key={h.id} className="text-xs text-navy/70 bg-navy/[0.03] rounded px-2.5 py-1.5">
                  <span className="font-semibold">{oportunidadesPorId.get(h.oportunidade_id)?.projeto || "Oportunidade"}</span>{" "}
                  {h.etapa_anterior ? `${h.etapa_anterior} → ` : "criada em "}
                  {h.etapa_nova} —{" "}
                  {new Date(h.data_mudanca).toLocaleDateString("pt-BR")}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-navy">Atividades ({atividades.length})</h2>
          {atividades.length === 0 ? (
            <p className="text-xs text-navy/40">Nenhuma atividade vinculada.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {atividades.map((a) => (
                <li key={a.id} className="bg-white rounded-lg border border-navy/10 p-3 flex items-center justify-between gap-2">
                  <span className="text-sm text-navy truncate">{a.tipo_atividade}</span>
                  <span className="text-xs text-navy/50 shrink-0">{a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy">NPS</h2>
            <button onClick={() => setModalNpsAberto(true)} className="flex items-center gap-1 text-xs font-semibold text-blue hover:underline">
              <Plus size={13} /> Registrar
            </button>
          </div>
          {nps.length === 0 ? (
            <p className="text-xs text-navy/40">Nenhuma resposta de NPS ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {nps.map((n) => (
                <li key={n.id} className="bg-white rounded-lg border border-navy/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-navy">Nota {n.nota}/10</span>
                    <span className="text-xs text-navy/40">{new Date(n.data).toLocaleDateString("pt-BR")}</span>
                  </div>
                  {n.comentario && <p className="text-xs text-navy/60 mt-1">{n.comentario}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {conversa && (
          <div className="flex flex-col gap-3 lg:col-span-2">
            <h2 className="text-sm font-bold text-navy">Últimas mensagens no WhatsApp</h2>
            <ul className="flex flex-col gap-1.5">
              {mensagens.map((m) => (
                <li
                  key={m.id}
                  className={`text-xs rounded px-2.5 py-1.5 max-w-lg ${
                    m.direcao === "enviada" ? "bg-blue/10 text-navy self-end ml-auto" : "bg-navy/[0.05] text-navy"
                  }`}
                >
                  {m.conteudo}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {modalEmpresaAberto && (
        <EmpresaModal
          empresa={empresa}
          gcs={gcs}
          onClose={() => setModalEmpresaAberto(false)}
          onSaved={() => {
            setModalEmpresaAberto(false);
            carregar();
          }}
        />
      )}

      {modalOportunidadeAberto && (
        <OportunidadeModal
          key={oportunidadeEditando?.id ?? "nova"}
          oportunidade={oportunidadeEditando ? { ...oportunidadeEditando, empresa_id: empresa.id } : null}
          empresas={[empresa]}
          gcs={gcs}
          onClose={() => setModalOportunidadeAberto(false)}
          onSaved={() => {
            setModalOportunidadeAberto(false);
            carregar();
          }}
          onDeleted={() => {
            setModalOportunidadeAberto(false);
            carregar();
          }}
        />
      )}

      {modalNpsAberto && (
        <div className="fixed inset-0 z-30 bg-navy/50 flex items-center justify-center p-4" onClick={() => setModalNpsAberto(false)}>
          <form
            onSubmit={salvarNps}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 flex flex-col gap-3"
          >
            <h2 className="font-bold text-navy">Registrar NPS</h2>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-navy/60 font-medium">Nota (0-10)</span>
              <input className="input" type="number" min={0} max={10} value={notaNps} onChange={(e) => setNotaNps(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-navy/60 font-medium">Comentário</span>
              <textarea className="input" rows={3} value={comentarioNps} onChange={(e) => setComentarioNps(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setModalNpsAberto(false)} className="px-4 py-2 rounded-md text-sm font-semibold text-navy/70 hover:bg-navy/5">
                Cancelar
              </button>
              <button type="submit" className="btn-primary">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
