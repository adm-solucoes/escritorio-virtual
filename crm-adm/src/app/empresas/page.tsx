"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Empresa, Gc } from "@/lib/types";
import { linkWhatsapp } from "@/lib/whatsapp";
import EmpresaModal from "@/components/EmpresaModal";

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [gcs, setGcs] = useState<Gc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
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
      supabase.from("gcs").select("*").order("nome"),
    ]).then(([{ data: empresasData }, { data: gcsData }]) => {
      if (cancelado) return;
      setEmpresas(empresasData ?? []);
      setGcs(gcsData ?? []);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, [refreshKey]);

  const gcPorId = useMemo(() => new Map(gcs.map((g) => [g.id, g.nome])), [gcs]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return empresas;
    return empresas.filter((e) =>
      [e.nome_empresa, e.nome_contato, e.cidade, e.segmento]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(termo))
    );
  }, [empresas, busca]);

  function abrirNovo() {
    setEmpresaEditando(null);
    setModalAberto(true);
  }

  function abrirEdicao(empresa: Empresa) {
    setEmpresaEditando(empresa);
    setModalAberto(true);
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
          <h1 className="text-xl font-semibold">Empresas</h1>
          <p className="text-sm text-black/60">{empresas.length} empresas cadastradas</p>
        </div>
        <div className="flex gap-2">
          <input
            className="input w-full sm:w-64"
            placeholder="Buscar por nome, contato, cidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <button
            onClick={abrirNovo}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-black text-white hover:bg-black/80 whitespace-nowrap"
          >
            <Plus size={16} /> Nova empresa
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-black/10 overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-black/50">Carregando...</p>
        ) : filtradas.length === 0 ? (
          <p className="p-6 text-sm text-black/50">Nenhuma empresa encontrada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-black/50 border-b border-black/10">
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Contato</th>
                <th className="px-4 py-3 font-medium">Cidade</th>
                <th className="px-4 py-3 font-medium">ICP</th>
                <th className="px-4 py-3 font-medium">Temperatura</th>
                <th className="px-4 py-3 font-medium">GC</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((empresa) => {
                const wa = linkWhatsapp(empresa.telefone);
                return (
                  <tr key={empresa.id} className="border-b border-black/5 last:border-0 hover:bg-black/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{empresa.nome_empresa}</div>
                      <div className="text-black/50 text-xs">{empresa.segmento}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{empresa.nome_contato}</div>
                      <div className="text-black/50 text-xs">{empresa.cargo}</div>
                    </td>
                    <td className="px-4 py-3">
                      {empresa.cidade}
                      {empresa.estado ? `/${empresa.estado}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      {empresa.icp && (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/5 text-xs font-semibold">
                          {empresa.icp}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {empresa.temperatura && <Badge temperatura={empresa.temperatura} />}
                    </td>
                    <td className="px-4 py-3 text-black/70">
                      {empresa.gc_responsavel_id ? gcPorId.get(empresa.gc_responsavel_id) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md hover:bg-green-50 text-green-600"
                            title="Conversar no WhatsApp"
                          >
                            <MessageCircle size={16} />
                          </a>
                        )}
                        <button
                          onClick={() => abrirEdicao(empresa)}
                          className="p-1.5 rounded-md hover:bg-black/5 text-black/60"
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => excluir(empresa)}
                          className="p-1.5 rounded-md hover:bg-red-50 text-red-500"
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
    Frio: "bg-blue-50 text-blue-600",
    Morno: "bg-amber-50 text-amber-700",
    Quente: "bg-red-50 text-red-600",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cores[temperatura] ?? "bg-black/5"}`}>
      {temperatura}
    </span>
  );
}
