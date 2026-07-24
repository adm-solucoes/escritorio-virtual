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
}

export interface EtapaFunilConfig {
  id: number;
  nome: EtapaFunil;
  ordem: number;
  probabilidade: number;
  dias_alerta_followup: number;
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
