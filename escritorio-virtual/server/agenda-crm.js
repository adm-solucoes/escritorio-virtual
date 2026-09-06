// Agenda do time, lida do CRM (que ja tem o Google Agenda conectado).
// Ver docs/plano-calendario.md.
//
// A sede NAO fala com o Google e NAO guarda token de ninguem: pergunta ao CRM,
// de servidor pra servidor, com um segredo compartilhado.
const usuarios = require('./usuarios');

const CRM_URL = (process.env.CRM_URL || '').replace(/\/$/, '');
const SEDE_TOKEN = process.env.SEDE_TOKEN || '';

// Sem isso, cada pessoa abrindo o painel viraria uma chamada ao Google por
// pessoa do time - a cota acaba rapido.
const CACHE_MS = 60 * 1000;
const JANELA_MS = 14 * 24 * 60 * 60 * 1000; // duas semanas a frente
const TIMEOUT_MS = 8000;

let cache = null;
let cacheEm = 0;
let buscando = null;

function configurado() {
  return Boolean(CRM_URL && SEDE_TOKEN);
}

function normalizarEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Casa a pessoa do CRM com a conta da sede pelo e-mail. Quem nao tem conta aqui
// aparece pelo nome que vem do CRM.
function comDonoDaSede(eventos) {
  return eventos.map((ev) => {
    const chave = normalizarEmail(ev.pessoaEmail);
    const conta = chave ? usuarios.porEmail(chave) : null;
    return {
      titulo: ev.titulo,
      inicio: new Date(ev.inicio).getTime(),
      fim: new Date(ev.fim).getTime(),
      pessoaNome: conta ? conta.nome : ev.pessoaNome,
      uid: conta ? conta.id : null,
    };
  }).filter((ev) => Number.isFinite(ev.inicio) && Number.isFinite(ev.fim));
}

async function buscarNoCrm() {
  const agora = Date.now();
  const url = CRM_URL + '/api/calendario/sede'
    + '?inicio=' + encodeURIComponent(new Date(agora - 24 * 60 * 60 * 1000).toISOString())
    + '&fim=' + encodeURIComponent(new Date(agora + JANELA_MS).toISOString());

  const corta = AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  const resp = await fetch(url, {
    headers: { Authorization: 'Bearer ' + SEDE_TOKEN },
    signal: corta,
  });

  if (!resp.ok) throw new Error('CRM respondeu ' + resp.status);
  const dados = await resp.json();
  return {
    eventos: comDonoDaSede(Array.isArray(dados.eventos) ? dados.eventos : []),
    erros: Array.isArray(dados.erros) ? dados.erros : [],
  };
}

// Devolve sempre um objeto util, nunca lanca: se o CRM estiver fora do ar o
// painel mostra o aviso e a sede segue funcionando normalmente.
async function obter() {
  if (!configurado()) {
    return { eventos: [], indisponivel: 'Agenda nao configurada (falta CRM_URL e SEDE_TOKEN).' };
  }

  if (cache && Date.now() - cacheEm < CACHE_MS) return cache;

  // uma busca por vez: dez pessoas abrindo o painel juntas nao viram dez chamadas
  if (!buscando) {
    buscando = buscarNoCrm()
      .then((dados) => {
        cache = { eventos: dados.eventos, erros: dados.erros };
        cacheEm = Date.now();
        return cache;
      })
      .catch((e) => {
        console.error('Agenda do CRM indisponivel:', e.message);
        // segura o cache velho se existir - melhor agenda de um minuto atras
        // do que painel vazio
        const resposta = cache
          ? Object.assign({}, cache, { indisponivel: 'Mostrando a ultima agenda que deu certo.' })
          : { eventos: [], indisponivel: 'Nao consegui falar com o CRM agora.' };
        return resposta;
      })
      .finally(() => { buscando = null; });
  }

  return buscando;
}

module.exports = { obter, configurado };
