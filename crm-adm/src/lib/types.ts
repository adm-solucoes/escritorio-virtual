export type Icp = "A" | "B" | "C";
export type Temperatura = "Frio" | "Morno" | "Quente";

export interface Gc {
  id: string;
  nome: string;
  email: string;
  status: "Ativo" | "Inativo";
  ordem_round_robin: number;
}

export interface Empresa {
  id: string;
  codigo: string | null;
  nome_empresa: string;
  cnpj: string | null;
  segmento: string | null;
  cidade: string | null;
  estado: string | null;
  nome_contato: string | null;
  cargo: string | null;
  telefone: string | null;
  email: string | null;
  origem_lead: string | null;
  icp: Icp | null;
  temperatura: Temperatura | null;
  gc_responsavel_id: string | null;
  data_cadastro: string | null;
  criado_em: string;
}

export const ETAPAS_FUNIL = [
  "Prospect",
  "Briefing",
  "Planejamento",
  "Validação",
  "Proposta",
  "Negociação",
  "Contrato Fechado",
  "Onboarding",
  "Adoção",
  "Expansão",
  "Indicação",
  "Renovação",
  "Perdido",
] as const;

export type EtapaFunil = (typeof ETAPAS_FUNIL)[number];

export const PROBABILIDADE_POR_ETAPA: Record<EtapaFunil, number> = {
  Prospect: 0.1,
  Briefing: 0.2,
  Planejamento: 0.3,
  Validação: 0.5,
  Proposta: 0.7,
  Negociação: 0.9,
  "Contrato Fechado": 1.0,
  Onboarding: 1.0,
  Adoção: 1.0,
  Expansão: 1.2,
  Indicação: 0.0,
  Renovação: 1.0,
  Perdido: 0.0,
};

export interface ConfiguracaoRelatorio {
  id: number;
  email_destino: string | null;
  envio_automatico: boolean;
  incluir_vendas: boolean;
  incluir_perdas: boolean;
  incluir_origem: boolean;
  incluir_responsavel: boolean;
  incluir_evolucao: boolean;
  notificar_atividades_atrasadas: boolean;
}

export interface EtapaFunilConfig {
  id: number;
  nome: EtapaFunil;
  ordem: number;
  probabilidade: number;
  dias_alerta_followup: number;
  tarefa_padrao: string | null;
}

export interface Oportunidade {
  id: string;
  codigo: string | null;
  empresa_id: string;
  projeto: string | null;
  valor_estimado: number | null;
  etapa_atual: EtapaFunil;
  probabilidade: number | null;
  receita_ponderada: number | null;
  ultima_interacao: string | null;
  proxima_acao: string | null;
  data_proxima_acao: string | null;
  gc_responsavel_id: string | null;
  observacoes: string | null;
  motivo_perda: string | null;
  criado_em: string;
  atualizado_em: string;
  empresas?: Empresa;
}

export const MOTIVOS_PERDA = [
  "Preço",
  "Concorrência",
  "Sem orçamento",
  "Não é decisor",
  "Timing / não é o momento",
  "Perdeu contato",
  "Outro",
] as const;

export type StatusAtividade = "Pendente" | "Em andamento" | "Concluído" | "Atrasado";

export interface Atividade {
  id: string;
  empresa_id: string | null;
  oportunidade_id: string | null;
  tipo_atividade: string;
  responsavel_id: string | null;
  status: StatusAtividade;
  prazo: string | null;
  data_criacao: string;
  alerta_disparado: boolean;
  empresas?: Empresa;
  oportunidades?: Oportunidade;
}

export const TIPOS_APOIO = ["Financeiro", "Divulgação", "Material", "Espaço", "Pessoas"] as const;
export type TipoApoio = (typeof TIPOS_APOIO)[number];

export type StatusSolicitacao = "Pendente" | "Em andamento" | "Atendida" | "Recusada";

export interface Solicitacao {
  id: string;
  oportunidade_id: string;
  nome_evento_projeto: string;
  objetivo: string | null;
  tipo_apoio: string[];
  tipo_apoio_outro: string | null;
  justificativa: string | null;
  data_evento: string | null;
  prazo: string | null;
  responsavel_solicitacao_id: string | null;
  recursos_necessarios: string | null;
  email_responsavel_atendimento: string;
  status: StatusSolicitacao;
  data_solicitacao: string;
  data_resposta: string | null;
}

export const META_EQUIPE_ID = "00000000-0000-0000-0000-000000000000";

export interface Meta {
  id: string;
  gc_id: string;
  mes: number;
  ano: number;
  valor_meta: number;
  criado_em: string;
}

// ==========================================================
// Automações (construtor visual — canvas de nós conectados)
// ==========================================================
export type StatusAutomacao = "rascunho" | "ativa";

export interface Automacao {
  id: string;
  nome: string;
  descricao: string | null;
  status: StatusAutomacao;
  criado_em: string;
  atualizado_em: string;
}

export type TipoNoAutomacao =
  | "gatilho_etapa"
  | "gatilho_atividade_atrasada"
  | "gatilho_sem_contato"
  | "gatilho_data_hora"
  | "condicao"
  | "acao_whatsapp"
  | "acao_agendar_reuniao"
  | "acao_criar_atividade"
  | "acao_notificar_interno"
  | "espera";

export interface AutomacaoNo {
  id: string;
  automacao_id: string;
  tipo: TipoNoAutomacao;
  posicao_x: number;
  posicao_y: number;
  config: Record<string, unknown>;
  criado_em: string;
}

export interface AutomacaoConexao {
  id: string;
  automacao_id: string;
  no_origem_id: string;
  no_destino_id: string;
  condicao: string | null;
}

export type ResultadoExecucaoAutomacao = "sucesso" | "erro" | "ignorado";

export interface AutomacaoExecucao {
  id: string;
  automacao_id: string | null;
  empresa_id: string | null;
  oportunidade_id: string | null;
  atividade_id: string | null;
  no_id: string | null;
  executado_em: string;
  resultado: ResultadoExecucaoAutomacao;
  erro: string | null;
}

export interface IntegracaoGoogle {
  id: string;
  gc_id: string;
  email_google: string;
  access_token: string;
  refresh_token: string;
  expira_em: string;
  compartilhar_agenda: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface WhatsappNumero {
  id: string;
  phone_number_id: string;
  numero: string;
  nome_exibicao: string | null;
  status: "pendente" | "verificado";
  ativo: boolean;
  criado_em: string;
}

export type StatusConversaWhatsapp = "Aberta" | "Arquivada";

export interface WhatsappConversa {
  id: string;
  empresa_id: string | null;
  telefone: string;
  nome_perfil_whatsapp: string | null;
  ultima_mensagem_em: string | null;
  status: StatusConversaWhatsapp;
  nao_lidas: number;
  criado_em: string;
  empresas?: Empresa;
}

export type DirecaoMensagemWhatsapp = "enviada" | "recebida";
export type TipoMensagemWhatsapp = "texto" | "template" | "midia" | "imagem" | "documento" | "audio" | "nota";
export type StatusEntregaWhatsapp = "enviando" | "enviado" | "entregue" | "lido" | "falhou" | null;

export interface WhatsappMensagem {
  id: string;
  conversa_id: string;
  direcao: DirecaoMensagemWhatsapp;
  conteudo: string;
  tipo: TipoMensagemWhatsapp;
  interna: boolean;
  midia_url: string | null;
  midia_nome: string | null;
  enviado_por_gc_id: string | null;
  whatsapp_message_id: string | null;
  status_entrega: StatusEntregaWhatsapp;
  criado_em: string;
  gcs?: { nome: string };
}
