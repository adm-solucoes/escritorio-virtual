export type Icp = "A" | "B" | "C";
export type Temperatura = "Frio" | "Morno" | "Quente";

export type RoleGc = "gestor" | "comercial" | "sem_acesso";

export interface Gc {
  id: string;
  nome: string;
  email: string;
  status: "Ativo" | "Inativo";
  ordem_round_robin: number;
  role: RoleGc;
  foto_url: string | null;
  cargo: string | null;
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
  instagram_usuario: string | null;
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
  tipo_pipeline: TipoPipeline;
}

export type TipoPipeline = "comercial" | "cs";

export type TipoLinkNotificacao = "empresa" | "oportunidade" | "atividade" | "sugestao_ia";

export interface LogAlteracao {
  id: string;
  registro_tipo: string;
  registro_id: string;
  campo_alterado: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  usuario: string | null;
  data: string;
}

export type TipoRegistroAnexo = "empresa" | "oportunidade";

export interface Anexo {
  id: string;
  registro_tipo: TipoRegistroAnexo;
  registro_id: string;
  nome_arquivo: string;
  caminho_storage: string;
  tamanho_bytes: number | null;
  tipo_mime: string | null;
  enviado_por_gc_id: string | null;
  criado_em: string;
}

export interface Notificacao {
  id: string;
  gc_id: string | null;
  tipo: string;
  mensagem: string;
  link_tipo: TipoLinkNotificacao | null;
  link_id: string | null;
  lida: boolean;
  criado_em: string;
}

export interface ChecklistEtapaItem {
  id: string;
  etapa: EtapaFunil;
  nome_item: string;
  prazo_dias: number;
  ordem: number;
  criado_em: string;
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
  tipo_pipeline: TipoPipeline;
  health_score: number | null;
  pausar_automacoes: boolean;
  data_renovacao: string | null;
  criado_em: string;
  atualizado_em: string;
  empresas?: Empresa;
}

export interface OportunidadeHistoricoEtapa {
  id: string;
  oportunidade_id: string;
  etapa_anterior: EtapaFunil | null;
  etapa_nova: EtapaFunil;
  data_mudanca: string;
  usuario: string | null;
}

export interface PipelineSnapshot {
  id: string;
  data: string;
  etapa: EtapaFunil;
  tipo_pipeline: TipoPipeline;
  valor_total: number;
  valor_ponderado: number;
  qtd: number;
  criado_em: string;
}

export interface NpsResposta {
  id: string;
  empresa_id: string;
  nota: number;
  comentario: string | null;
  data: string;
  criado_em: string;
}

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

// Mantido só por compatibilidade com solicitações antigas (a tela nova usa
// "área", ver AREAS abaixo) — não usar em código novo.
export const TIPOS_APOIO = ["Financeiro", "Divulgação", "Material", "Espaço", "Pessoas"] as const;
export type TipoApoio = (typeof TIPOS_APOIO)[number];

/** Áreas da empresa — cada solicitação é destinada a uma delas, e cada área
 * tem um cargo de gestor (que recebe/controla as solicitações da própria
 * área) e um cargo "de linha" (colaborador, sem ser gestor). Presidência é a
 * exceção: só existe o cargo único de Presidente. */
export const AREAS = ["Presidência", "Marketing", "Gente e Gestão (GG)", "Comercial", "Projetos"] as const;
export type Area = (typeof AREAS)[number];

export interface CargoConfig {
  label: string;
  area: Area;
  gestor: boolean;
}

export const CARGOS: CargoConfig[] = [
  { label: "Presidente", area: "Presidência", gestor: true },
  { label: "Gestor de Marketing", area: "Marketing", gestor: true },
  { label: "Marketing", area: "Marketing", gestor: false },
  { label: "Gestor de Gente e Gestão (GG)", area: "Gente e Gestão (GG)", gestor: true },
  { label: "Gente e Gestão (GG)", area: "Gente e Gestão (GG)", gestor: false },
  { label: "Gestor Comercial", area: "Comercial", gestor: true },
  { label: "Comercial", area: "Comercial", gestor: false },
  { label: "Gestor de Projetos", area: "Projetos", gestor: true },
  { label: "Projetos", area: "Projetos", gestor: false },
];

export function gestoresDaArea(gcs: Gc[], area: string | null): Gc[] {
  if (!area) return [];
  const cargosGestores = new Set(CARGOS.filter((c) => c.gestor && c.area === area).map((c) => c.label));
  return gcs.filter((gc) => gc.cargo && cargosGestores.has(gc.cargo));
}

/** O cargo agora É o controle de acesso — não existe mais um "papel"
 * escolhido à parte. Cargo de gestor de área vira acesso de gestor no
 * sistema; cargo de linha vira acesso comercial; sem cargo nenhum, sem
 * acesso — obriga alguém a atribuir um cargo antes da pessoa ver qualquer
 * coisa. */
export function nivelAcessoDoCargo(cargo: string | null | undefined): RoleGc {
  if (!cargo) return "sem_acesso";
  const config = CARGOS.find((c) => c.label === cargo);
  if (!config) return "sem_acesso";
  return config.gestor ? "gestor" : "comercial";
}

export type StatusSolicitacao = "Pendente" | "Em andamento" | "Atendida" | "Recusada";

export interface Solicitacao {
  id: string;
  oportunidade_id: string;
  nome_evento_projeto: string;
  objetivo: string | null;
  tipo_apoio: string[];
  tipo_apoio_outro: string | null;
  area: string | null;
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

export interface SolicitacaoMensagem {
  id: string;
  solicitacao_id: string;
  autor_gc_id: string | null;
  mensagem: string;
  criado_em: string;
  gcs?: { nome: string; foto_url: string | null } | null;
}

export interface ScoreRule {
  chave: string;
  label: string;
  peso: number;
  ativo: boolean;
}

export interface MotivoPerdaConfig {
  id: string;
  motivo: string;
  ativo: boolean;
  ordem: number;
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
  | "gatilho_renovacao_proxima"
  | "condicao"
  | "acao_whatsapp"
  | "acao_agendar_reuniao"
  | "acao_criar_atividade"
  | "acao_notificar_interno"
  | "acao_email"
  | "acao_alertar_renovacao"
  | "acao_resumir_ia"
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

export type CanalSugestaoIa = "whatsapp" | "email";
export type StatusSugestaoIa = "pendente" | "aprovada" | "descartada";

export interface SugestaoIaAutomacao {
  id: string;
  automacao_id: string | null;
  no_id: string | null;
  empresa_id: string | null;
  oportunidade_id: string | null;
  canal: CanalSugestaoIa;
  assunto: string | null;
  conteudo: string;
  status: StatusSugestaoIa;
  criado_em: string;
  revisado_em: string | null;
  revisado_por_gc_id: string | null;
  empresas?: Empresa;
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

// ==========================================================
// Ação Rápida (comando por texto — parsing por regex, sem IA)
// ==========================================================
export interface AcaoRapidaContato {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  empresa_id: string | null;
  ultima_vez_usado: string;
  quantidade_usos: number;
  criado_em: string;
}

export interface AcaoRapidaMotivoRecente {
  id: string;
  motivo: string;
  quantidade_usos: number;
  ultima_vez_usado: string;
}

export type CanalAcaoRapida = "calendario" | "email" | "whatsapp";

export interface AcaoRapidaExecucao {
  id: string;
  contato_id: string | null;
  empresa_id: string | null;
  oportunidade_id: string | null;
  atividade_id: string | null;
  canal: CanalAcaoRapida;
  resultado: "sucesso" | "erro";
  detalhes: string | null;
  criado_em: string;
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
  gcs?: { nome: string; foto_url: string | null };
}

export type StatusConversaInstagram = "Aberta" | "Arquivada";

export interface InstagramConversa {
  id: string;
  empresa_id: string | null;
  instagram_scoped_id: string;
  username: string | null;
  nome_perfil: string | null;
  ultima_mensagem_em: string | null;
  status: StatusConversaInstagram;
  nao_lidas: number;
  criado_em: string;
  empresas?: Empresa;
}

export type TipoMensagemInstagram = "texto" | "imagem" | "video" | "audio" | "midia" | "nota";
export type StatusEntregaInstagram = "enviando" | "enviado" | "lido" | "falhou" | null;

export interface InstagramMensagem {
  id: string;
  conversa_id: string;
  direcao: DirecaoMensagemWhatsapp;
  conteudo: string;
  tipo: TipoMensagemInstagram;
  interna: boolean;
  midia_url: string | null;
  midia_nome: string | null;
  enviado_por_gc_id: string | null;
  instagram_message_id: string | null;
  status_entrega: StatusEntregaInstagram;
  criado_em: string;
  gcs?: { nome: string; foto_url: string | null };
}

// ==========================================================
// Captura pública de leads (item 16 — Fase 3)
// ==========================================================
export interface FormularioCaptura {
  id: string;
  nome: string;
  chave_api: string;
  origem_lead: string | null;
  ativo: boolean;
  criado_em: string;
}
