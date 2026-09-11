// Decoracao do escritorio: lista de diferencas em cima do mapa base do map.js.
// Guardada em server/data/mapa.json. Ver docs/plano-decorador.md.
const fs = require('fs');
const path = require('path');
const map = require('./map');
const pastaDados = require('./dados');

const PASTA = pastaDados.PASTA;
const ARQUIVO = path.join(PASTA, 'mapa.json');

// So esses tipos podem ser colocados pelo decorador. Fora daqui (o chao das
// zonas, por exemplo) nao e coisa que a pessoa escolhe na grade.
const TILES_DO_CATALOGO = [
  map.LIVRE, map.MESA, map.MESA_MONITOR, map.MESA_CENTRO, map.MESA_REUNIAO,
  map.CADEIRA, map.IMPRESSORA, map.PLANTA, map.QUADRO, map.LOUSA, map.CAVALETE,
  map.CABIDE, map.TAPETE, map.SOFA_CIMA, map.SOFA_BAIXO, map.BANCO, map.ESTANTE,
  map.ARMARIO, map.BALCAO, map.PAREDE, map.JANELA, map.CERCA, map.ARVORE,
  map.ARBUSTO, map.PEDRA, map.AGUA,
  map.MESA_DUPLA, map.MESA_NOTEBOOK, map.PLANTA_GRANDE, map.VASO_FLORES,
  map.CACTO, map.POLTRONA, map.CADEIRA_VERMELHA, map.BEBEDOURO, map.TV,
  map.RELOGIO, map.TAPETE_REDONDO,
  map.CADEIRA_BAIXO, map.CADEIRA_ESQ, map.CADEIRA_DIR,
  map.CADEIRA_VERMELHA_BAIXO, map.CADEIRA_VERMELHA_ESQ, map.CADEIRA_VERMELHA_DIR,
  map.MESA_BAIXO, map.MESA_ESQ, map.MESA_DIR,
  map.MESA_MONITOR_BAIXO, map.MESA_MONITOR_ESQ, map.MESA_MONITOR_DIR,
  map.PUFE, map.MESA_REDONDA, map.GELADEIRA, map.AQUARIO, map.LUMINARIA_PE,
];

// chave "c,r" -> tile. Mapa em vez de lista: editar a mesma celula duas vezes
// nao acumula lixo no arquivo.
const mudancas = new Map();
// chave "c,r" -> id do objeto apoiado na celula (camada de cima).
const objetos = new Map();
// chave "c,r" -> { titulo, url, porUid, em }. Terceira camada: o que aquele
// movel ABRE quando alguem clica nele. Ver docs/plano-conteudo.md.
const conteudos = new Map();

const MAX_TITULO = 40;
const MAX_URL = 500;

function chave(c, r) {
  return c + ',' + r;
}

function garantirPasta() {
  if (!fs.existsSync(PASTA)) fs.mkdirSync(PASTA, { recursive: true });
}

function comoLista(mapa, campo) {
  return Array.from(mapa.entries()).map(([k, valor]) => {
    const [c, r] = k.split(',').map(Number);
    return { c, r, [campo]: valor };
  });
}

function salvar() {
  garantirPasta();
  const dados = {
    mudancas: comoLista(mudancas, 't'),
    objetos: comoLista(objetos, 'o'),
    conteudos: conteudosParaEnvio(),
  };
  const tmp = ARQUIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, ARQUIVO);
}

function carregar() {
  try {
    if (!fs.existsSync(ARQUIVO)) return;
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    (dados.mudancas || []).forEach((m) => {
      if (!posicaoValida(m.c, m.r) || !tileValido(m.t)) return;
      mudancas.set(chave(m.c, m.r), m.t);
      map.tiles[m.r][m.c] = m.t; // aplica por cima do mapa base
    });
    (dados.objetos || []).forEach((o) => {
      if (!posicaoValida(o.c, o.r) || !objetoValido(o.o) || !o.o) return;
      objetos.set(chave(o.c, o.r), o.o);
      map.objetos[o.r][o.c] = o.o;
    });
    // A validacao roda de novo na leitura, e nao so na escrita: o arquivo e
    // editavel a mao e um `javascript:` colado ali viraria clique armado pra
    // todo mundo que entrasse na sede.
    (dados.conteudos || []).forEach((x) => {
      if (!posicaoValida(x.c, x.r)) return;
      const url = urlValida(x.url);
      const titulo = tituloValido(x.titulo);
      if (!url || !titulo) return;
      conteudos.set(chave(x.c, x.r), {
        titulo, url, porUid: x.porUid || null, em: x.em || null,
      });
    });
  } catch (e) {
    console.error('[mapa] nao consegui ler a decoracao:', e.message);
  }
}

function posicaoValida(c, r) {
  return Number.isInteger(c) && Number.isInteger(r)
    && c >= 0 && c < map.COLS && r >= 0 && r < map.ROWS;
}

function tileValido(t) {
  return TILES_DO_CATALOGO.includes(t);
}

function objetoValido(o) {
  return Number.isInteger(o) && o >= 0 && o <= map.OBJETO_MAX;
}

// So http e https. Esta lista curta e o ponto todo: o link vai ser aberto pelo
// navegador de TODA visita, entao `javascript:` seria codigo rodando na sessao
// dos outros e `data:`/`file:` seriam paginas forjadas com a cara do site.
function urlValida(url) {
  if (typeof url !== 'string') return null;
  const cru = url.trim();
  if (!cru || cru.length > MAX_URL) return null;
  let endereco;
  try {
    endereco = new URL(cru);
  } catch (e) {
    return null;
  }
  if (endereco.protocol !== 'http:' && endereco.protocol !== 'https:') return null;
  return endereco.href;
}

function tituloValido(titulo) {
  if (typeof titulo !== 'string') return null;
  const limpo = titulo.replace(/\s+/g, ' ').trim().slice(0, MAX_TITULO);
  return limpo || null;
}

// Conteudo mora num MOVEL, nunca no chao: uma celula vazia com link seria um
// pedaco de piso clicavel que ninguem adivinha que existe.
function podeTerConteudo(c, r) {
  return posicaoValida(c, r) && map.tiles[r][c] !== map.LIVRE;
}

function definirConteudo(c, r, { titulo, url }, porUid) {
  if (!podeTerConteudo(c, r)) return null;
  const endereco = urlValida(url);
  const nome = tituloValido(titulo);
  if (!endereco || !nome) return null;

  conteudos.set(chave(c, r), {
    titulo: nome, url: endereco, porUid: porUid || null, em: Date.now(),
  });
  salvar();
  return true;
}

function tirarConteudo(c, r) {
  if (!conteudos.delete(chave(c, r))) return false;
  salvar();
  return true;
}

// Sem salvar: quem chama ja vai salvar junto com a mudanca que causou isso.
function limparConteudo(c, r) {
  return conteudos.delete(chave(c, r));
}

function conteudosParaEnvio() {
  return Array.from(conteudos.entries()).map(([k, v]) => {
    const [c, r] = k.split(',').map(Number);
    return { c, r, titulo: v.titulo, url: v.url, porUid: v.porUid, em: v.em };
  });
}

// Retorna { mudou, objetoCaiu } - `mudou` false quando nada mudou de verdade
// (pra nao ficar reemitindo o mesmo tile).
function editar(c, r, t) {
  if (!posicaoValida(c, r) || !tileValido(t)) return { mudou: false };
  if (map.tiles[r][c] === t) return { mudou: false };

  map.tiles[r][c] = t;
  if (t === map.baseTiles[r][c]) mudancas.delete(chave(c, r)); // voltou ao original
  else mudancas.set(chave(c, r), t);

  // Trocou o movel por algo que nao segura nada? O que estava em cima vai junto.
  const objetoCaiu = !map.SUPERFICIES.has(t) && limparObjeto(c, r);
  // E se a celula virou chao, o link morre com o movel: link em piso vazio
  // seria um clique invisivel no meio do corredor.
  const linkCaiu = t === map.LIVRE && limparConteudo(c, r);

  salvar();
  return { mudou: true, objetoCaiu, linkCaiu };
}

// Trocar o movel de baixo leva junto o que estava apoiado nele (senao fica um
// monitor flutuando no chao depois de apagar a mesa).
function editarObjeto(c, r, o) {
  if (!posicaoValida(c, r) || !objetoValido(o)) return false;
  // So se apoia coisa EM CIMA de uma superficie: mesa, balcao, estante,
  // armario. Nada de caneca no meio do corredor. Tirar (o === 0) vale sempre,
  // senao um objeto que ficou orfao nunca mais sairia dali.
  if (o && !map.SUPERFICIES.has(map.tiles[r][c])) return false;
  if (map.objetos[r][c] === o) return false;

  map.objetos[r][c] = o;
  if (o) objetos.set(chave(c, r), o);
  else objetos.delete(chave(c, r));
  salvar();
  return true;
}

function limparObjeto(c, r) {
  if (!map.objetos[r] || !map.objetos[r][c]) return false;
  map.objetos[r][c] = 0;
  objetos.delete(chave(c, r));
  return true;
}

function paraEnvio() {
  return comoLista(mudancas, 't');
}

function objetosParaEnvio() {
  return comoLista(objetos, 'o');
}

carregar();

module.exports = {
  editar, editarObjeto, limparObjeto, paraEnvio, objetosParaEnvio,
  definirConteudo, tirarConteudo, conteudosParaEnvio, podeTerConteudo,
  tileValido, objetoValido, posicaoValida, urlValida, TILES_DO_CATALOGO,
};
