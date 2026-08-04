/**
 * Cliente da API do Trello — SÓ PARA USO NO SERVIDOR.
 *
 * A chave e o token ficam em variáveis sem prefixo NEXT_PUBLIC_ justamente
 * pra não vazarem no bundle do navegador: quem tem o token acessa a conta
 * inteira do Trello. Toda chamada daqui acontece em route handler.
 *
 * O quadro é o "Kanban — Marketing · Gente · Gestão", criado pelo script em
 * `trello-kanban/`. As listas e etiquetas foram definidas lá; aqui a gente
 * só lê e cria cartão.
 */

const BASE = "https://api.trello.com/1";

export interface CartaoTrello {
  id: string;
  nome: string;
  descricao: string;
  url: string;
  etiquetas: { nome: string; cor: string }[];
  membros: string[];
  prazo: string | null;
  prazoConcluido: boolean;
}

export interface ListaTrello {
  id: string;
  nome: string;
  cartoes: CartaoTrello[];
}

export function trelloConfigurado(): boolean {
  return Boolean(process.env.TRELLO_API_KEY && process.env.TRELLO_TOKEN && process.env.TRELLO_BOARD_ID);
}

function credenciais() {
  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  const boardId = process.env.TRELLO_BOARD_ID;
  if (!apiKey || !token || !boardId) {
    throw new Error("Trello não configurado (faltam TRELLO_API_KEY, TRELLO_TOKEN ou TRELLO_BOARD_ID).");
  }
  return { apiKey, token, boardId };
}

async function requisitar<T>(
  metodo: "GET" | "POST" | "PUT",
  caminho: string,
  parametros: Record<string, string | undefined> = {}
): Promise<T> {
  const { apiKey, token } = credenciais();
  const url = new URL(BASE + caminho);
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor !== undefined) url.searchParams.set(chave, valor);
  }
  url.searchParams.set("key", apiKey);
  url.searchParams.set("token", token);

  const resposta = await fetch(url, {
    method: metodo,
    headers: { Accept: "application/json" },
    // Sem cache: o quadro muda o tempo todo e mostrar cartão desatualizado
    // é pior do que demorar 200ms a mais.
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    // A mensagem de erro NUNCA pode incluir a URL, que carrega key e token.
    throw new Error(`Trello respondeu ${resposta.status} em ${metodo} ${caminho}: ${corpo.slice(0, 200)}`);
  }

  return (await resposta.json()) as T;
}

interface ListaBruta {
  id: string;
  name: string;
}

interface CartaoBruto {
  id: string;
  name: string;
  desc: string;
  url: string;
  idList: string;
  due: string | null;
  dueComplete: boolean;
  labels: { name: string; color: string }[];
  members: { fullName: string }[];
}

/** Lê o quadro inteiro (listas + cartões) numa tacada. */
export async function lerQuadro(): Promise<{ listas: ListaTrello[]; url: string; nome: string }> {
  const { boardId } = credenciais();

  const [quadro, listas, cartoes] = await Promise.all([
    requisitar<{ name: string; url: string }>("GET", `/boards/${boardId}`, { fields: "name,url" }),
    requisitar<ListaBruta[]>("GET", `/boards/${boardId}/lists`, { fields: "id,name", filter: "open" }),
    requisitar<CartaoBruto[]>("GET", `/boards/${boardId}/cards`, {
      fields: "id,name,desc,url,idList,due,dueComplete",
      members: "true",
      member_fields: "fullName",
    }),
  ]);

  const porLista = new Map<string, CartaoTrello[]>();
  for (const c of cartoes) {
    const cartao: CartaoTrello = {
      id: c.id,
      nome: c.name,
      descricao: c.desc ?? "",
      url: c.url,
      etiquetas: (c.labels ?? []).filter((l) => l.name).map((l) => ({ nome: l.name, cor: l.color })),
      membros: (c.members ?? []).map((m) => m.fullName),
      prazo: c.due,
      prazoConcluido: Boolean(c.dueComplete),
    };
    const atual = porLista.get(c.idList) ?? [];
    atual.push(cartao);
    porLista.set(c.idList, atual);
  }

  return {
    nome: quadro.name,
    url: quadro.url,
    listas: listas.map((l) => ({ id: l.id, nome: l.name, cartoes: porLista.get(l.id) ?? [] })),
  };
}

/** Etiqueta do quadro correspondente a uma área do CRM, se existir. */
async function acharEtiqueta(nomeEtiqueta: string): Promise<string | undefined> {
  const { boardId } = credenciais();
  const etiquetas = await requisitar<{ id: string; name: string }[]>("GET", `/boards/${boardId}/labels`, {
    fields: "id,name",
    limit: "1000",
  });
  return etiquetas.find((e) => e.name?.trim().toLowerCase() === nomeEtiqueta.trim().toLowerCase())?.id;
}

/** Id da primeira lista cujo nome contenha `trecho` (ex: "Backlog"). */
async function acharLista(trecho: string): Promise<string> {
  const { boardId } = credenciais();
  const listas = await requisitar<ListaBruta[]>("GET", `/boards/${boardId}/lists`, {
    fields: "id,name",
    filter: "open",
  });
  const alvo = listas.find((l) => l.name.toLowerCase().includes(trecho.toLowerCase()));
  if (!alvo) throw new Error(`Nenhuma lista com "${trecho}" no quadro do Trello.`);
  return alvo.id;
}

/**
 * Área do CRM → etiqueta do quadro. O quadro só tem Marketing/Gente/Gestão,
 * mas o CRM tem cinco áreas; Comercial, Projetos e Presidência entram como
 * "Gestão", que é onde esse tipo de demanda é acompanhada.
 */
export function etiquetaDaArea(area: string | null): string | null {
  if (!area) return null;
  if (/marketing/i.test(area)) return "Marketing";
  if (/gente/i.test(area)) return "Gente";
  if (/presid|comercial|projeto/i.test(area)) return "Gestão";
  return null;
}

/** Cria um cartão no Backlog a partir de uma solicitação do CRM. */
export async function criarCartaoDeSolicitacao(dados: {
  titulo: string;
  descricao: string;
  area: string | null;
  prazo: string | null;
}): Promise<{ id: string; url: string }> {
  const idList = await acharLista("Backlog");

  const nomeEtiqueta = etiquetaDaArea(dados.area);
  const idEtiqueta = nomeEtiqueta ? await acharEtiqueta(nomeEtiqueta) : undefined;

  const cartao = await requisitar<{ id: string; url: string }>("POST", "/cards", {
    idList,
    name: dados.titulo,
    desc: dados.descricao,
    pos: "top",
    idLabels: idEtiqueta,
    due: dados.prazo ?? undefined,
  });

  return { id: cartao.id, url: cartao.url };
}
