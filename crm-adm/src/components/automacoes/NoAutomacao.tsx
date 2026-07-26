"use client";

import { Handle, Position, type NodeProps } from "reactflow";
import {
  GitBranch,
  MessageCircle,
  CalendarPlus,
  ListChecks,
  Bell,
  Clock,
  Workflow,
  AlarmClockCheck,
  CalendarClock,
  Mail,
  RefreshCw,
} from "lucide-react";
import type { TipoNoAutomacao } from "@/lib/types";
import { COR_CATEGORIA, definicaoDoTipo } from "@/lib/automacoes-nos";

const ICONE_POR_TIPO: Record<TipoNoAutomacao, React.ComponentType<{ size?: number }>> = {
  gatilho_etapa: Workflow,
  gatilho_atividade_atrasada: AlarmClockCheck,
  gatilho_sem_contato: CalendarClock,
  gatilho_data_hora: Clock,
  gatilho_renovacao_proxima: RefreshCw,
  condicao: GitBranch,
  acao_whatsapp: MessageCircle,
  acao_agendar_reuniao: CalendarPlus,
  acao_criar_atividade: ListChecks,
  acao_notificar_interno: Bell,
  acao_email: Mail,
  acao_alertar_renovacao: RefreshCw,
  espera: Clock,
};

export interface DadosNoAutomacao {
  tipo: TipoNoAutomacao;
  config: Record<string, unknown>;
  resumo: string;
}

export default function NoAutomacao({ data, selected }: NodeProps<DadosNoAutomacao>) {
  const definicao = definicaoDoTipo(data.tipo);
  const cor = COR_CATEGORIA[definicao.categoria];
  const Icone = ICONE_POR_TIPO[data.tipo];
  const ehCondicao = data.tipo === "condicao";
  const ehGatilho = definicao.categoria === "gatilho";

  return (
    <div
      className={`rounded-lg border-2 ${cor.border} ${cor.bg} px-3 py-2.5 min-w-[190px] shadow-sm ${
        selected ? "ring-2 ring-blue" : ""
      }`}
    >
      {!ehGatilho && <Handle type="target" position={Position.Top} className="!bg-navy/40" />}

      <div className={`flex items-center gap-1.5 text-xs font-bold ${cor.text}`}>
        <Icone size={13} />
        {definicao.label}
      </div>
      {data.resumo && <div className="text-[11px] text-navy/60 mt-0.5 break-words">{data.resumo}</div>}

      {ehCondicao ? (
        <div className="flex justify-between text-[10px] font-semibold text-navy/50 mt-2">
          <span>Não</span>
          <span>Sim</span>
        </div>
      ) : null}

      {ehCondicao ? (
        <>
          <Handle type="source" position={Position.Bottom} id="nao" style={{ left: "25%" }} className="!bg-red" />
          <Handle type="source" position={Position.Bottom} id="sim" style={{ left: "75%" }} className="!bg-green-600" />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!bg-navy/40" />
      )}
    </div>
  );
}
