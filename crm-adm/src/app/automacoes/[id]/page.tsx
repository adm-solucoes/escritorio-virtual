"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactFlow, {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "reactflow";
import "reactflow/dist/style.css";
import { ArrowLeft, Play, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { TipoNoAutomacao } from "@/lib/types";
import { definicaoDoTipo, resumoConfig } from "@/lib/automacoes-nos";
import NoAutomacao, { type DadosNoAutomacao } from "@/components/automacoes/NoAutomacao";
import PaletaNos from "@/components/automacoes/PaletaNos";
import PainelEdicaoNo from "@/components/automacoes/PainelEdicaoNo";

const NODE_TYPES = { noAutomacao: NoAutomacao };

interface Template {
  name: string;
  language: string;
}

export default function AutomacaoCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [nome, setNome] = useState("");
  const [status, setStatus] = useState<"rascunho" | "ativa">("rascunho");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [nodes, setNodes] = useState<Node<DadosNoAutomacao>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [noSelecionadoId, setNoSelecionadoId] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      const [{ data: automacao }, { data: nos }, { data: conexoes }] = await Promise.all([
        supabase.from("automacoes").select("*").eq("id", id).maybeSingle(),
        supabase.from("automacao_nos").select("*").eq("automacao_id", id),
        supabase.from("automacao_conexoes").select("*").eq("automacao_id", id),
      ]);
      if (cancelado) return;

      if (automacao) {
        setNome(automacao.nome);
        setStatus(automacao.status);
      }

      setNodes(
        (nos ?? []).map((n) => ({
          id: n.id,
          type: "noAutomacao",
          position: { x: n.posicao_x, y: n.posicao_y },
          data: { tipo: n.tipo as TipoNoAutomacao, config: n.config as Record<string, unknown>, resumo: resumoConfig(n.tipo, n.config) },
        }))
      );

      setEdges(
        (conexoes ?? []).map((c) => ({
          id: c.id,
          source: c.no_origem_id,
          target: c.no_destino_id,
          sourceHandle: c.condicao ?? undefined,
          label: c.condicao === "sim" ? "Sim" : c.condicao === "nao" ? "Não" : undefined,
        }))
      );

      setLoading(false);
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [id]);

  useEffect(() => {
    fetch("/api/whatsapp/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]));
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onConnect = useCallback((connection: Connection) => {
    const condicao = connection.sourceHandle === "sim" || connection.sourceHandle === "nao" ? connection.sourceHandle : undefined;
    setEdges((eds) =>
      addEdge({ ...connection, label: condicao === "sim" ? "Sim" : condicao === "nao" ? "Não" : undefined }, eds)
    );
  }, []);

  function adicionarNo(tipo: TipoNoAutomacao) {
    const definicao = definicaoDoTipo(tipo);
    const novoId = crypto.randomUUID();
    const offset = nodes.length * 40;
    setNodes((nds) => [
      ...nds,
      {
        id: novoId,
        type: "noAutomacao",
        position: { x: 250 + (offset % 300), y: 80 + offset },
        data: { tipo, config: { ...definicao.configPadrao }, resumo: resumoConfig(tipo, definicao.configPadrao) },
      },
    ]);
  }

  const noSelecionado = useMemo(() => nodes.find((n) => n.id === noSelecionadoId) ?? null, [nodes, noSelecionadoId]);

  function atualizarConfigNoSelecionado(config: Record<string, unknown>) {
    if (!noSelecionadoId) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === noSelecionadoId
          ? { ...n, data: { ...n.data, config, resumo: resumoConfig(n.data.tipo, config) } }
          : n
      )
    );
  }

  function excluirNoSelecionado() {
    if (!noSelecionadoId) return;
    setNodes((nds) => nds.filter((n) => n.id !== noSelecionadoId));
    setEdges((eds) => eds.filter((e) => e.source !== noSelecionadoId && e.target !== noSelecionadoId));
    setNoSelecionadoId(null);
  }

  async function salvar() {
    setSalvando(true);
    setMensagem(null);

    await supabase.from("automacoes").update({ nome, atualizado_em: new Date().toISOString() }).eq("id", id);

    if (nodes.length > 0) {
      await supabase.from("automacao_nos").upsert(
        nodes.map((n) => ({
          id: n.id,
          automacao_id: id,
          tipo: n.data.tipo,
          posicao_x: n.position.x,
          posicao_y: n.position.y,
          config: n.data.config,
        }))
      );
      await supabase
        .from("automacao_nos")
        .delete()
        .eq("automacao_id", id)
        .not("id", "in", `(${nodes.map((n) => n.id).join(",")})`);
    } else {
      await supabase.from("automacao_nos").delete().eq("automacao_id", id);
    }

    await supabase.from("automacao_conexoes").delete().eq("automacao_id", id);
    if (edges.length > 0) {
      await supabase.from("automacao_conexoes").insert(
        edges.map((e) => ({
          automacao_id: id,
          no_origem_id: e.source,
          no_destino_id: e.target,
          condicao: e.sourceHandle === "sim" || e.sourceHandle === "nao" ? e.sourceHandle : null,
        }))
      );
    }

    setSalvando(false);
    setMensagem("Salvo!");
    setTimeout(() => setMensagem(null), 2500);
  }

  async function alternarAtivacao() {
    await salvar();
    const novoStatus = status === "ativa" ? "rascunho" : "ativa";
    await supabase.from("automacoes").update({ status: novoStatus }).eq("id", id);
    setStatus(novoStatus);
  }

  async function executarAgora() {
    setExecutando(true);
    setMensagem(null);
    try {
      const res = await fetch("/api/automacoes/executar", { method: "POST" });
      const data = await res.json();
      setMensagem(res.ok ? "Execução disparada — confira o histórico em breve." : `Erro: ${data.error}`);
    } catch {
      setMensagem("Erro ao executar.");
    }
    setExecutando(false);
  }

  if (loading) {
    return <p className="p-6 text-sm text-navy/50">Carregando...</p>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-navy/10 bg-white flex items-center gap-3 flex-wrap">
        <Link href="/automacoes" className="p-1.5 rounded-md hover:bg-navy/5 text-navy/60 shrink-0">
          <ArrowLeft size={18} />
        </Link>
        <input
          className="font-bold text-navy text-lg bg-transparent border-none outline-none focus:bg-navy/5 rounded px-1 min-w-0 flex-1"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
            status === "ativa" ? "bg-green-100 text-green-700" : "bg-navy/5 text-navy/50"
          }`}
        >
          {status === "ativa" ? "Ativa" : "Rascunho"}
        </span>
        {mensagem && <span className="text-xs text-navy/60">{mensagem}</span>}
        <div className="flex gap-2 shrink-0">
          <button onClick={executarAgora} disabled={executando} className="btn-secondary whitespace-nowrap">
            <Play size={14} /> {executando ? "Executando..." : "Executar agora"}
          </button>
          <button onClick={salvar} disabled={salvando} className="btn-secondary whitespace-nowrap">
            <Save size={14} /> {salvando ? "Salvando..." : "Salvar alterações"}
          </button>
          <button onClick={alternarAtivacao} className="btn-primary whitespace-nowrap">
            {status === "ativa" ? "Pausar automação" : "Ativar automação"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <PaletaNos onAdicionar={adicionarNo} />

        <div className="flex-1 min-w-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setNoSelecionadoId(node.id)}
            onPaneClick={() => setNoSelecionadoId(null)}
            nodeTypes={NODE_TYPES}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {noSelecionado && (
          <PainelEdicaoNo
            tipo={noSelecionado.data.tipo}
            config={noSelecionado.data.config}
            templates={templates}
            onChange={atualizarConfigNoSelecionado}
            onFechar={() => setNoSelecionadoId(null)}
            onExcluir={excluirNoSelecionado}
          />
        )}
      </div>
    </div>
  );
}
