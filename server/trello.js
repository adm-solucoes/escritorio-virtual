// Quadro do Trello da ADM Solucoes, o mesmo que o CRM le.
// Ver docs/plano-trello.md.
//
// SO NO SERVIDOR. Quem tem o TRELLO_TOKEN acessa a conta inteira do Trello,
// entao ele nunca vai pro navegador: o cliente recebe o quadro ja montado,
// nunca a credencial. Mesma regra do crm-adm/src/lib/trello.ts.
const BASE = 'https://api.trello.com/1';

const API_KEY = process.env.TRELLO_API_KEY || '';
const TOKEN = process.env.TRELLO_TOKEN || '';
const BOARD_ID = process.env.TRELLO_BOARD_ID || '';

// O quadro muda devagar (e coisa de pessoa arrastando cartao), entao um cache
// mais folgado que o da agenda ja evita bater na API a cada abertura.
const CACHE_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 8000;

let cache = null;
let cacheEm = 0;
let buscando = null;

function configurado() {
  return Boolean(API_KEY && TOKEN && BOARD_ID);
}

async function pedir(caminho, params) {
  const p = new URLSearchParams(Object.assign({ key: API_KEY, token: TOKEN }, params));
  const url = BASE + caminho + '?' + p.toString();
  const corta = AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  const resp = await fetch(url, { signal: corta });
  if (!resp.ok) {
    // nunca repassa o corpo cru: pode conter eco da credencial
    throw new Error('Trello respondeu ' + resp.status);
  }
  return resp.json();
}

async function montar() {
  const [quadro, listas, cartoes] = await Promise.all([
    pedir('/boards/' + BOARD_ID, { fields: 'name,url' }),
    pedir('/boards/' + BOARD_ID + '/lists', { fields: 'id,name', filter: 'open' }),
    pedir('/boards/' + BOARD_ID + '/cards', {
      fields: 'id,name,desc,url,idList,due,dueComplete',
      members: 'true',
      member_fields: 'fullName',
    }),
  ]);

  const porLista = new Map();
  cartoes.forEach((c) => {
    const cartao = {
      id: c.id,
      nome: c.name,
      url: c.url,
      etiquetas: (c.labels || [])
        .filter((l) => l.name)
        .map((l) => ({ nome: l.name, cor: l.color })),
      membros: (c.members || []).map((m) => m.fullName),
      prazo: c.due || null,
      prazoConcluido: Boolean(c.dueComplete),
    };
    if (!porLista.has(c.idList)) porLista.set(c.idList, []);
    porLista.get(c.idList).push(cartao);
  });

  return {
    nome: quadro.name,
    url: quadro.url,
    listas: listas.map((l) => ({
      id: l.id,
      nome: l.name,
      cartoes: porLista.get(l.id) || [],
    })),
  };
}

// Nunca lanca: se o Trello cair, o painel avisa e a sede segue funcionando.
async function obter() {
  if (!configurado()) {
    return {
      listas: [],
      indisponivel: 'Trello nao configurado (falta TRELLO_API_KEY, TRELLO_TOKEN e TRELLO_BOARD_ID).',
    };
  }

  if (cache && Date.now() - cacheEm < CACHE_MS) return cache;

  if (!buscando) {
    buscando = montar()
      .then((dados) => {
        cache = dados;
        cacheEm = Date.now();
        return cache;
      })
      .catch((e) => {
        console.error('Quadro do Trello indisponivel:', e.message);
        return cache
          ? Object.assign({}, cache, { indisponivel: 'Mostrando o ultimo quadro que deu certo.' })
          : { listas: [], indisponivel: 'Nao consegui falar com o Trello agora.' };
      })
      .finally(() => { buscando = null; });
  }

  return buscando;
}

module.exports = { obter, configurado };
