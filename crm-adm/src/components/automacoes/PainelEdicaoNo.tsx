"use client";

import { X } from "lucide-react";
import { ETAPAS_FUNIL } from "@/lib/types";
import { definicaoDoTipo } from "@/lib/automacoes-nos";
import type { TipoNoAutomacao } from "@/lib/types";

interface Template {
  name: string;
  language: string;
}

interface Props {
  tipo: TipoNoAutomacao;
  config: Record<string, unknown>;
  templates: Template[];
  onChange: (config: Record<string, unknown>) => void;
  onFechar: () => void;
  onExcluir: () => void;
}

export default function PainelEdicaoNo({ tipo, config, templates, onChange, onFechar, onExcluir }: Props) {
  const definicao = definicaoDoTipo(tipo);

  function set(campo: string, valor: unknown) {
    onChange({ ...config, [campo]: valor });
  }

  return (
    <div className="w-80 shrink-0 border-l border-navy/10 bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-navy/10">
        <div>
          <h3 className="font-bold text-sm text-navy">{definicao.label}</h3>
          <p className="text-xs text-navy/50">{definicao.descricao}</p>
        </div>
        <button onClick={onFechar} className="text-navy/40 hover:text-navy shrink-0">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 text-sm">
        {tipo === "gatilho_etapa" && (
          <Campo label="Etapa">
            <select className="input" value={String(config.etapa ?? "")} onChange={(e) => set("etapa", e.target.value)}>
              {ETAPAS_FUNIL.map((etapa) => (
                <option key={etapa} value={etapa}>
                  {etapa}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {tipo === "gatilho_sem_contato" && (
          <Campo label="Dias sem interação">
            <input
              type="number"
              min={1}
              className="input"
              value={Number(config.dias ?? 7)}
              onChange={(e) => set("dias", Number(e.target.value))}
            />
          </Campo>
        )}

        {tipo === "gatilho_data_hora" && (
          <Campo label="Data e hora">
            <input
              type="datetime-local"
              className="input"
              value={String(config.dataHora ?? "")}
              onChange={(e) => set("dataHora", e.target.value)}
            />
          </Campo>
        )}

        {tipo === "gatilho_renovacao_proxima" && (
          <Campo label="Dias antes da renovação">
            <input
              type="number"
              min={1}
              className="input"
              value={Number(config.diasAntes ?? 30)}
              onChange={(e) => set("diasAntes", Number(e.target.value))}
            />
            <span className="text-[11px] text-navy/40">
              Usa o campo &quot;Data de renovação&quot; da oportunidade (editável nas etapas de CS)
            </span>
          </Campo>
        )}

        {tipo === "condicao" && (
          <>
            <Campo label="Campo">
              <select className="input" value={String(config.campo ?? "valor_estimado")} onChange={(e) => set("campo", e.target.value)}>
                <option value="valor_estimado">Valor estimado</option>
                <option value="etapa_atual">Etapa atual</option>
                <option value="gc_responsavel_id">Responsável</option>
              </select>
            </Campo>
            <Campo label="Operador">
              <select className="input" value={String(config.operador ?? ">")} onChange={(e) => set("operador", e.target.value)}>
                <option value=">">maior que</option>
                <option value="<">menor que</option>
                <option value="=">igual a</option>
                <option value="!=">diferente de</option>
              </select>
            </Campo>
            <Campo label="Valor">
              <input className="input" value={String(config.valor ?? "")} onChange={(e) => set("valor", e.target.value)} />
            </Campo>
          </>
        )}

        {tipo === "acao_whatsapp" && (
          <>
            <Campo label="Tipo de envio">
              <select className="input" value={String(config.modo ?? "template")} onChange={(e) => set("modo", e.target.value)}>
                <option value="template">Template aprovado (funciona sempre)</option>
                <option value="texto">Texto livre (só dentro da janela de 24h)</option>
              </select>
            </Campo>
            {config.modo === "texto" ? (
              <Campo label="Mensagem">
                <textarea
                  className="input min-h-[90px] resize-none"
                  value={String(config.texto ?? "")}
                  onChange={(e) => set("texto", e.target.value)}
                />
              </Campo>
            ) : (
              <Campo label="Template">
                <select
                  className="input"
                  value={String(config.templateNome ?? "")}
                  onChange={(e) => set("templateNome", e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {templates.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
          </>
        )}

        {tipo === "acao_agendar_reuniao" && (
          <>
            <Campo label="Título do evento">
              <input
                className="input"
                placeholder="Reunião com {empresa}"
                value={String(config.tituloTemplate ?? "")}
                onChange={(e) => set("tituloTemplate", e.target.value)}
              />
              <span className="text-[11px] text-navy/40">Use {"{empresa}"} pra inserir o nome automaticamente</span>
            </Campo>
            <Campo label="Horário padrão">
              <input
                type="time"
                className="input"
                value={String(config.horarioPadrao ?? "10:00")}
                onChange={(e) => set("horarioPadrao", e.target.value)}
              />
            </Campo>
            <Campo label="Duração (minutos)">
              <input
                type="number"
                min={15}
                step={15}
                className="input"
                value={Number(config.duracaoMinutos ?? 30)}
                onChange={(e) => set("duracaoMinutos", Number(e.target.value))}
              />
            </Campo>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.diasUteis !== false}
                onChange={(e) => set("diasUteis", e.target.checked)}
                className="w-4 h-4"
              />
              Só agendar em dias úteis
            </label>
          </>
        )}

        {tipo === "acao_criar_atividade" && (
          <>
            <Campo label="Tipo de atividade">
              <input
                className="input"
                value={String(config.tipoAtividade ?? "")}
                onChange={(e) => set("tipoAtividade", e.target.value)}
              />
            </Campo>
            <Campo label="Prazo (dias a partir de hoje)">
              <input
                type="number"
                min={0}
                className="input"
                value={Number(config.prazoDias ?? 1)}
                onChange={(e) => set("prazoDias", Number(e.target.value))}
              />
            </Campo>
          </>
        )}

        {tipo === "acao_notificar_interno" && (
          <Campo label="Mensagem">
            <textarea
              className="input min-h-[90px] resize-none"
              value={String(config.mensagem ?? "")}
              onChange={(e) => set("mensagem", e.target.value)}
            />
          </Campo>
        )}

        {tipo === "acao_email" && (
          <>
            <Campo label="Assunto">
              <input className="input" value={String(config.assunto ?? "")} onChange={(e) => set("assunto", e.target.value)} />
            </Campo>
            <Campo label="Corpo do e-mail (HTML simples)">
              <textarea
                className="input min-h-[120px] resize-none"
                value={String(config.corpoHtml ?? "")}
                onChange={(e) => set("corpoHtml", e.target.value)}
              />
              <span className="text-[11px] text-navy/40">Use {"{empresa}"} pra inserir o nome da empresa automaticamente</span>
            </Campo>
          </>
        )}

        {tipo === "acao_alertar_renovacao" && (
          <p className="text-xs text-navy/50">
            Sem configuração — envia e-mail e cria uma notificação interna pro GC responsável pela oportunidade.
          </p>
        )}

        {tipo === "espera" && (
          <div className="flex gap-2">
            <Campo label="Quantidade" className="flex-1">
              <input
                type="number"
                min={1}
                className="input"
                value={Number(config.quantidade ?? 1)}
                onChange={(e) => set("quantidade", Number(e.target.value))}
              />
            </Campo>
            <Campo label="Unidade" className="flex-1">
              <select className="input" value={String(config.unidade ?? "dias")} onChange={(e) => set("unidade", e.target.value)}>
                <option value="horas">Horas</option>
                <option value="dias">Dias</option>
              </select>
            </Campo>
          </div>
        )}

        {tipo === "gatilho_atividade_atrasada" && (
          <p className="text-xs text-navy/50">Não precisa configurar nada — dispara pra qualquer atividade que passar do prazo.</p>
        )}
      </div>

      <div className="p-4 border-t border-navy/10">
        <button onClick={onExcluir} className="w-full text-center text-xs font-semibold text-red hover:underline">
          Excluir este nó
        </button>
      </div>
    </div>
  );
}

function Campo({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-navy/60 font-medium text-xs">{label}</span>
      {children}
    </label>
  );
}
