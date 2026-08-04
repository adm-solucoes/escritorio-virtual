import { log } from "./log.js";

/** Ordem exata pedida. `pos` é atribuído sequencialmente pra garantir a ordem
 * mesmo quando o script roda de novo e só algumas listas faltam. */
export const LISTAS = [
  "📥 Backlog / Ideias",
  "📋 A Fazer",
  "🔄 Em Progresso",
  "👀 Em Revisão / Aprovação",
  "✅ Concluído",
  "🗄️ Arquivado",
];

/** Cores conferidas contra a API (válidas: yellow, purple, blue, red, green,
 * orange, black, sky, pink, lime). */
export const ETIQUETAS = [
  { nome: "Marketing", cor: "blue" },
  { nome: "Gente", cor: "green" },
  { nome: "Gestão", cor: "yellow" },
  { nome: "Urgente", cor: "red" },
  { nome: "Bloqueado", cor: "black" },
];

const CARTAO_MODELO_NOME = "📌 MODELO — copie este cartão para abrir uma demanda";

const CARTAO_MODELO_DESC = `**Este cartão é um modelo. Não trabalhe nele.**
Use o menu do cartão → *Copiar* para criar a sua demanda, e apague estas instruções.

---

**O que precisa ser feito**
_Descreva em 1-2 frases, do ponto de vista de quem vai receber o resultado._

**Por que / para quê**
_Qual problema isso resolve. Ajuda quem for executar a tomar decisões sozinho._

**Como saber que está pronto**
_Critérios objetivos. Se não dá pra responder "sim/não", está vago demais._

**Prazo:** _dd/mm — ou "sem prazo definido"_
**Responsável:** _marque a pessoa no cartão, não escreva aqui_

---

Antes de mover para **👀 Em Revisão / Aprovação**, confira o checklist abaixo.`;

const CHECKLIST_ITENS = [
  "Etiqueta da área aplicada (Marketing / Gente / Gestão)",
  "Responsável marcado no cartão",
  "Prazo definido (ou marcado como sem prazo)",
  "Critério de pronto preenchido",
  "Anexos e links necessários adicionados",
];

/**
 * Acha o quadro pelo nome ou cria. A busca é por nome EXATO (após normalizar
 * espaços) porque o nome tem caracteres especiais — "—" e "·" — que o usuário
 * pode acabar digitando diferente; comparar normalizado evita criar um quadro
 * duplicado por causa de um espaço a mais.
 */
export async function garantirQuadro(cliente, { nome, workspace }) {
  const normalizar = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const alvo = normalizar(nome);

  const meus = await cliente.get("/members/me/boards", { fields: "id,name,url,closed", filter: "open" });
  const existente = (meus || []).find((b) => normalizar(b.name) === alvo);

  if (existente) {
    log.pulado(`quadro já existe — reutilizando: ${existente.name}`);
    return { ...existente, jaExistia: true };
  }

  // defaultLists/defaultLabels são `true` por padrão na API: sem desligar,
  // o quadro nasceria com "To Do/Doing/Done" e 6 etiquetas sem nome, que
  // depois teriam que ser limpas na mão.
  const criado = await cliente.post(
    "/boards/",
    {
      name: nome,
      defaultLists: false,
      defaultLabels: false,
      idOrganization: workspace || undefined,
      prefs_permissionLevel: "org",
      desc: "Quadro Kanban compartilhado entre Marketing, Gente e Gestão.",
    },
    { descricao: `criar quadro "${nome}"` }
  );

  log.criado(`quadro criado: ${nome}`);
  // Em dry-run o POST devolve só um id fictício, sem `name` — guardamos o
  // nome pretendido pra o resumo final não sair vazio.
  return { ...criado, __nomePretendido: nome, jaExistia: false };
}

/** Cria só as listas que faltam, preservando a ordem pedida. */
export async function garantirListas(cliente, quadroId) {
  const atuais = (await cliente.get(`/boards/${quadroId}/lists`, { fields: "id,name,pos", filter: "open" })) || [];
  const porNome = new Map(atuais.map((l) => [l.name.trim(), l]));
  const resultado = {};

  for (const [indice, nome] of LISTAS.entries()) {
    const existente = porNome.get(nome);
    if (existente) {
      log.pulado(`lista já existe: ${nome}`);
      resultado[nome] = existente.id;
      continue;
    }
    // pos crescente e espaçado: mantém a ordem correta mesmo que só algumas
    // listas estejam faltando numa segunda execução.
    const nova = await cliente.post(
      `/boards/${quadroId}/lists`,
      { name: nome, pos: (indice + 1) * 1000 },
      { descricao: `criar lista "${nome}"` }
    );
    log.criado(`lista criada: ${nome}`);
    resultado[nome] = nova.id;
  }

  return resultado;
}

/** Cria só as etiquetas que faltam. Compara por nome (case-insensitive). */
export async function garantirEtiquetas(cliente, quadroId) {
  const atuais = (await cliente.get(`/boards/${quadroId}/labels`, { fields: "id,name,color", limit: 1000 })) || [];
  const porNome = new Map(atuais.filter((l) => l.name).map((l) => [l.name.trim().toLowerCase(), l]));
  const resultado = {};

  for (const { nome, cor } of ETIQUETAS) {
    const existente = porNome.get(nome.toLowerCase());
    if (existente) {
      if (existente.color !== cor) {
        log.aviso(`etiqueta "${nome}" existe mas está ${existente.color} (esperado ${cor}) — mantida como está`);
      } else {
        log.pulado(`etiqueta já existe: ${nome} (${cor})`);
      }
      resultado[nome] = existente.id;
      continue;
    }
    const nova = await cliente.post(
      `/boards/${quadroId}/labels`,
      { name: nome, color: cor },
      { descricao: `criar etiqueta "${nome}"` }
    );
    log.criado(`etiqueta criada: ${nome} (${cor})`);
    resultado[nome] = nova.id;
  }

  return resultado;
}

/** Cria o cartão-modelo no Backlog, com descrição e checklist — só se ainda
 * não existir um cartão com o mesmo nome nessa lista. */
export async function garantirCartaoModelo(cliente, { listaBacklogId, quadroId }) {
  const cartoes = (await cliente.get(`/lists/${listaBacklogId}/cards`, { fields: "id,name" })) || [];
  const existente = cartoes.find((c) => c.name.trim() === CARTAO_MODELO_NOME);

  if (existente) {
    log.pulado("cartão-modelo já existe");
    return existente.id;
  }

  const cartao = await cliente.post(
    "/cards",
    {
      idList: listaBacklogId,
      name: CARTAO_MODELO_NOME,
      desc: CARTAO_MODELO_DESC,
      pos: "top",
    },
    { descricao: "criar cartão-modelo" }
  );
  log.criado("cartão-modelo criado");

  if (cartao.__dryRun) {
    log.info("   [dry-run] checklist do cartão-modelo seria criado aqui");
    return cartao.id;
  }

  const checklist = await cliente.post(
    "/checklists",
    { idCard: cartao.id, name: "Antes de mandar para revisão" },
    { descricao: "criar checklist" }
  );

  for (const item of CHECKLIST_ITENS) {
    await cliente.post(`/checklists/${checklist.id}/checkItems`, { name: item, checked: false });
  }
  log.criado(`checklist criado com ${CHECKLIST_ITENS.length} itens`);

  return cartao.id;
}
