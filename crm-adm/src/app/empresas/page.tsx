"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, MessagesSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Empresa, Gc, Oportunidade, ScoreRule } from "@/lib/types";
import { obterOuCriarConversaWhatsapp } from "@/lib/whatsapp";
import { calcularScoreLead, classificarScore } from "@/lib/score";
import { useGcAtual } from "@/lib/useGcAtual";
import EmpresaModal from "@/components/EmpresaModal";

export default function EmpresasPage() {
  const router = useRouter();
  const { gc: gcAtual } = useGcAtual();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [gcs, setGcs] = useState<Gc[]>([]);
  const [regrasScore, setRegrasScore] = useState<ScoreRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [ordenarPorScore, setOrdenarPorScore] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [empresaEditando, setEmpresaEditando] = useState<Empresa | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function carregar() {
    setRefreshKey((k) => k + 1);
  }

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      supabase.from("empresas").select("*").order("nome_empresa"),
      supabase.from("oportunidades").select("*"),
      supabase.from("gcs").select("*").order("nome"),
      supabase.from("score_rules").select("*"),
    ]).then(([{ data: empresasData }, { data: opsData }, { data: gcsData }, { data: regrasData }]) => {
      if (cancelado) return;
      setEmpresas(empresasData ?? []);
      setOportunidades(opsData ?? []);
      setGcs(gcsData ?? []);
      setRegrasScore((regrasData as ScoreRule[]) ?? []);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, [refreshKey]);

  const gcPorId = useMemo(() => new Map(gcs.map((g) => [g.id, g.nome])), [gcs]);

  const oportunidadesPorEmpresa = useMemo(() => {
    const map = new Map<string, Oportunidade[]>();
    for (const o of oportunidades) {
      const arr = map.get(o.empresa_id) ?? [];
      arr.push(o);
      map.set(o.empresa_id, arr);
    }
    return map;
  }, [oportunidades]);

  const scorePorEmpresa = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of empresas) {
      map.set(e.id, calcularScoreLead(e, oportunidadesPorEmpresa.get(e.id) ?? [], regrasScore).pontos);
    }
    return map;
  }, [empresas, oportunidadesPorEmpresa, regrasScore]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    // GC comercial só vê a própria carteira; gestor vê todas as empresas
    let lista =
      gcAtual?.role === "comercial" ? empresas.filter((e) => e.gc_responsavel_id === gcAtual.id) : empresas;
    if (termo) {
      lista = lista.filter((e) =>
        [e.nome_empresa, e.nome_contato, e.cidade, e.segmento]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(termo))
      );
    }
    if (ordenarPorScore) {
      lista = [...lista].sort((a, b) => (scorePorEmpresa.get(b.id) ?? 0) - (scorePorEmpresa.get(a.id) ?? 0));
    }
    return lista;
  }, [empresas, busca, ordenarPorScore, scorePorEmpresa, gcAtual]);

  function abrirNovo() {
    setEmpresaEditando(null);
    setModalAberto(true);
  }

  function abrirEdicao(empresa: Empresa) {
    setEmpresaEditando(empresa);
    setModalAberto(true);
  }

  async function abrirConversaWhatsapp(empresa: Empresa) {
    const resultado = await obterOuCriarConversaWhatsapp(empresa.id, empresa.telefone);
    if ("erro" in resultado) {
      alert(resultado.erro);
      return;
    }
    router.push(`/whatsapp?conversa=${resultado.id}`);
  }

  async function excluir(empresa: Empresa) {
    if (!confirm(`Excluir a empresa "${empresa.nome_empresa}"? Isso também remove as oportunidades ligadas a ela.`)) {
      return;
    }
    const { error } = await supabase.from("empresas").delete().eq("id", empresa.id);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    carregar();
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-navy">Empresas</h1>
          <p className="text-sm text-navy/60">{empresas.length} empresas cadastradas</p>
        </div>
        <div className="flex gap-2">
          <input
            className="input w-full sm:w-64"
            placeholder="Buscar por nome, contato, cidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <button onClick={abrirNovo} className="btn-primary whitespace-nowrap">
            <Plus size={16} /> Nova empresa
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-navy/10 overflow-x-auto shadow-sm">
        {loading ? (
          <p className="p-6 text-sm text-navy/50">Carregando...</p>
        ) : filtradas.length === 0 ? (
          <p className="p-6 text-sm text-navy/50">Nenhuma empresa encontrada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-navy/50 border-b border-navy/10 bg-navy/[0.03]">
                <th className="px-4 py-3 font-semibold">Empresa</th>
                <th className="px-4 py-3 font-semibold">Contato</th>
                <th className="px-4 py-3 font-semibold">Cidade</th>
                <th className="px-4 py-3 font-semibold">ICP</th>
                <th className="px-4 py-3 font-semibold">Temperatura</th>
                <th className="px-4 py-3 font-semibold">
                  <button
                    onClick={() => setOrdenarPorScore((v) => !v)}
                    className={`flex items-center gap-1 hover:text-navy ${ordenarPorScore ? "text-navy" : ""}`}
                    title="Ordenar por score"
                  >
                    Score <ArrowUpDown size={12} />
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">GC</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((empresa) => {
                const score = scorePorEmpresa.get(empresa.id) ?? 0;
                const classificacao = classificarScore(score);
                return (
                  <tr key={empresa.id} className="border-b border-navy/5 last:border-0 hover:bg-navy/[0.02]">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/empresas/${empresa.id}`)}
                        className="font-semibold text-navy hover:text-blue hover:underline text-left"
                      >
                        {empresa.nome_empresa}
                      </button>
                      <div className="text-navy/50 text-xs">{empresa.segmento}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{empresa.nome_contato}</div>
                      <div className="text-navy/50 text-xs">{empresa.cargo}</div>
                    </td>
                    <td className="px-4 py-3">
                      {empresa.cidade}
                      {empresa.estado ? `/${empresa.estado}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      {empresa.icp && (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue/10 text-blue text-xs font-bold">
                          {empresa.icp}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {empresa.temperatura && <Badge temperatura={empresa.temperatura} />}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${classificacao.cor}`}>
                        {score} · {classificacao.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-navy/70">
                      {empresa.gc_responsavel_id ? gcPorId.get(empresa.gc_responsavel_id) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => abrirConversaWhatsapp(empresa)}
                          className="p-1.5 rounded-md hover:bg-green-50 text-green-600"
                          title="Conversar no WhatsApp (pelo CRM)"
                        >
                          <MessagesSquare size={16} />
                        </button>
                        <button
                          onClick={() => abrirEdicao(empresa)}
                          className="p-1.5 rounded-md hover:bg-blue/10 text-blue"
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => excluir(empresa)}
                          className="p-1.5 rounded-md hover:bg-red/10 text-red"
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalAberto && (
        <EmpresaModal
          key={empresaEditando?.id ?? "novo"}
          empresa={empresaEditando}
          gcs={gcs}
          onClose={() => setModalAberto(false)}
          onSaved={() => {
            setModalAberto(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function Badge({ temperatura }: { temperatura: string }) {
  const cores: Record<string, string> = {
    Frio: "bg-blue/10 text-blue",
    Morno: "bg-amber-100 text-amber-700",
    Quente: "bg-red/10 text-red",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cores[temperatura] ?? "bg-navy/5"}`}>
      {temperatura}
    </span>
  );
}
