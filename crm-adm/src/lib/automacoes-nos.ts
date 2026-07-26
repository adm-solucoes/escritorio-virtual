import type { TipoNoAutomacao } from "./types";

export type CategoriaNo = "gatilho" | "condicao" | "acao" | "espera";

export interface DefinicaoNo {
  tipo: TipoNoAutomacao;
  categoria: CategoriaNo;
  label: string;
  descricao: string;
  configPadrao: Record<string, unknown>;
}

export const DEFINICOES_NOS: DefinicaoNo[] = [
  {
    tipo: "gatilho_etapa",
    categoria: "gatilho",
    label: "Oportunidade muda de etapa",
    descricao: "Dispara quando uma oportunidade entra na etapa escolhida",
    configPadrao: { etapa: "Proposta" },
  },
  {
    tipo: "gatilho_atividade_atrasada",
    categoria: "gatilho",
    label: "Atividade atrasada",
    descricao: "Dispara quando uma atividade passa do prazo",
    configPadrao: {},
  },
  {
    tipo: "gatilho_sem_contato",
    categoria: "gatilho",
    label: "Empresa sem contato há X dias",
    descricao: "Dispara quando a oportunidade fica X dias sem interação",
    configPadrao: { dias: 7 },
  },
  {
    tipo: "gatilho_data_hora",
    categoria: "gatilho",
    label: "Data/hora específica",
    descricao: "Dispara uma única vez na data e hora configuradas",
    configPadrao: { dataHora: "" },
  },
  {
    tipo: "gatilho_renovacao_proxima",
    categoria: "gatilho",
    label: "Renovação se aproximando",
    descricao: "Dispara quando faltam X dias para a data de renovação da oportunidade",
    configPadrao: { diasAntes: 30 },
  },
  {
    tipo: "condicao",
    categoria: "condicao",
    label: "Condição",
    descricao: "Ramifica o fluxo (Sim/Não) com base em valor, etapa, responsável ou pergunta pra IA",
    configPadrao: { campo: "valor_estimado", operador: ">", valor: "", perguntaIA: "" },
  },
  {
    tipo: "acao_whatsapp",
    categoria: "acao",
    label: "Follow-up WhatsApp",
    descricao: "Envia mensagem de WhatsApp pro contato da empresa",
    configPadrao: { modo: "template", templateNome: "", templateIdioma: "pt_BR", texto: "", instrucaoIA: "", enviarAutomatico: false },
  },
  {
    tipo: "acao_agendar_reuniao",
    categoria: "acao",
    label: "Agendar reunião",
    descricao: "Cria evento no Google Calendar do GC responsável + e-mail de confirmação",
    configPadrao: { horarioPadrao: "10:00", duracaoMinutos: 30, diasUteis: true, tituloTemplate: "Reunião com {empresa}", descricaoTemplate: "" },
  },
  {
    tipo: "acao_criar_atividade",
    categoria: "acao",
    label: "Criar atividade",
    descricao: "Cria uma atividade pro GC responsável, com prazo",
    configPadrao: { tipoAtividade: "Follow-up", prazoDias: 1 },
  },
  {
    tipo: "acao_notificar_interno",
    categoria: "acao",
    label: "Notificação interna",
    descricao: "Avisa o GC responsável dentro do CRM (aparece em Atividades)",
    configPadrao: { mensagem: "" },
  },
  {
    tipo: "acao_email",
    categoria: "acao",
    label: "Follow-up por e-mail",
    descricao: "Envia e-mail pro contato da empresa",
    configPadrao: { modo: "fixo", assunto: "", corpoHtml: "", instrucaoIA: "", enviarAutomatico: false },
  },
  {
    tipo: "acao_alertar_renovacao",
    categoria: "acao",
    label: "Alertar GC sobre renovação",
    descricao: "Envia e-mail pro GC responsável e cria notificação interna — não configura nada",
    configPadrao: {},
  },
  {
    tipo: "acao_resumir_ia",
    categoria: "acao",
    label: "Resumo e próxima ação (IA)",
    descricao: "Gera um resumo da situação e sugere a próxima ação — vira nota interna pro GC, nunca fala com o cliente",
    configPadrao: {},
  },
  {
    tipo: "espera",
    categoria: "espera",
    label: "Espera",
    descricao: "Pausa o fluxo por um tempo antes do próximo passo",
    configPadrao: { quantidade: 1, unidade: "dias" },
  },
];

export function definicaoDoTipo(tipo: TipoNoAutomacao): DefinicaoNo {
  return DEFINICOES_NOS.find((d) => d.tipo === tipo) ?? DEFINICOES_NOS[0];
}

export function resumoConfig(tipo: TipoNoAutomacao, config: Record<string, unknown>): string {
  switch (tipo) {
    case "gatilho_etapa":
      return `Etapa: ${config.etapa ?? "—"}`;
    case "gatilho_atividade_atrasada":
      return "Qualquer atividade vencida";
    case "gatilho_sem_contato":
      return `${config.dias ?? "—"} dias sem interação`;
    case "gatilho_data_hora":
      return config.dataHora ? new Date(String(config.dataHora)).toLocaleString("pt-BR") : "Sem data definida";
    case "gatilho_renovacao_proxima":
      return `${config.diasAntes ?? 30} dias antes da renovação`;
    case "condicao":
      return config.campo === "ia"
        ? `IA: ${config.perguntaIA ? String(config.perguntaIA).slice(0, 60) : "—"}`
        : `${config.campo ?? "—"} ${config.operador ?? ""} ${config.valor ?? ""}`;
    case "acao_whatsapp":
      if (config.modo === "ia") return `IA${config.enviarAutomatico ? " (envio automático)" : " (revisão antes de enviar)"}`;
      return config.modo === "template" ? `Template: ${config.templateNome ?? "—"}` : "Mensagem de texto";
    case "acao_agendar_reuniao":
      return `${config.duracaoMinutos ?? 30}min às ${config.horarioPadrao ?? "10:00"}`;
    case "acao_criar_atividade":
      return `${config.tipoAtividade ?? "—"} (+${config.prazoDias ?? 0}d)`;
    case "acao_notificar_interno":
      return String(config.mensagem ?? "—");
    case "acao_email":
      if (config.modo === "ia") return `IA${config.enviarAutomatico ? " (envio automático)" : " (revisão antes de enviar)"}`;
      return String(config.assunto || "—");
    case "acao_alertar_renovacao":
      return "E-mail + notificação interna pro GC";
    case "acao_resumir_ia":
      return "Resumo + próxima ação, como nota interna";
    case "espera":
      return `${config.quantidade ?? 1} ${config.unidade ?? "dias"}`;
    default:
      return "";
  }
}

export const COR_CATEGORIA: Record<CategoriaNo, { bg: string; border: string; text: string }> = {
  gatilho: { bg: "bg-blue/10", border: "border-blue/40", text: "text-blue" },
  condicao: { bg: "bg-amber-50", border: "border-amber-400", text: "text-amber-700" },
  acao: { bg: "bg-green-50", border: "border-green-400", text: "text-green-700" },
  espera: { bg: "bg-navy/5", border: "border-navy/30", text: "text-navy/70" },
};
